/**
 * Motor de wishlist — porte TypeScript do conector Java/Quarkus de origem.
 *
 * Fluxo em 3 fases (preservado):
 *  1. Scroll do Master Data VTEX (entidade wishlist) coletando documentos
 *  2. Resolução SKU → RefId via catálogo, com cache por execução
 *  3. Envio por wishlist ao endpoint /api/v3/wishlist/update da Emarsys
 *
 * CORREÇÃO DE PROPÓSITO (bug do original): o checkpoint agora FILTRA o scroll
 * (`updatedIn > checkpoint` no _where). No Java o checkpoint era salvo mas
 * nunca usado na consulta — toda execução varria a base inteira.
 */

import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { getAccessToken, invalidateToken, type OAuth2Config } from '../emarsys/oauth2.js';

// ── VTEX Master Data ─────────────────────────────────────────────────────────

export type WishlistVtexConfig = {
  baseUrl: string;
  appKey: string;
  appToken: string;
  tag: string;
};

export type WishlistDoc = {
  id?: string;
  email?: string;
  updatedIn?: string;
  ListItemsWrapper?: Array<{ ListItems?: Array<{ Sku?: unknown }> }>;
};

export function createVtexMdClient(cfg: WishlistVtexConfig): AxiosInstance {
  return axios.create({
    baseURL: cfg.baseUrl,
    timeout: 30_000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': cfg.appKey,
      'X-VTEX-API-AppToken': cfg.appToken,
    },
  });
}

export type ScrollPage = {
  docs: WishlistDoc[];
  mdToken: string | null;
};

/**
 * Uma página do scroll do Master Data. O token de continuação vem no header
 * X-VTEX-MD-TOKEN da primeira resposta e é repassado nas seguintes.
 */
export async function scrollWishlists(
  client: AxiosInstance,
  entity: string,
  checkpointISO: string,
  size: number,
  mdToken: string | null,
): Promise<ScrollPage> {
  // O Master Data não aceita parâmetros posicionais — sanitiza o ISO antes de
  // interpolar (a fonte é o checkpoint do banco, mas defesa em profundidade)
  const safeCheckpoint = checkpointISO.replace(/[^0-9TZ:.+-]/g, '');
  const params: Record<string, string | number> = {
    _fields: 'id,email,ListItemsWrapper,updatedIn',
    // Correção do bug do original: o checkpoint entra no filtro
    _where: `email<>"" AND updatedIn>"${safeCheckpoint}"`,
    _sort: 'updatedIn ASC',
    _size: size,
    _schema: entity,
  };
  if (mdToken) params._token = mdToken;

  const response = await client.get<WishlistDoc[]>(`/api/dataentities/${entity}/scroll`, { params });

  const headerToken = response.headers['x-vtex-md-token'];
  return {
    docs: Array.isArray(response.data) ? response.data : [],
    mdToken: typeof headerToken === 'string' && headerToken ? headerToken : null,
  };
}

/** RefId de um SKU via catálogo; fallback = o próprio skuId (como no original). */
export async function fetchRefId(client: AxiosInstance, skuId: string, tag: string): Promise<string> {
  try {
    const response = await client.get<{ RefId?: string }>(
      `/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`,
    );
    return response.data?.RefId || skuId;
  } catch (err) {
    console.warn(`⚠️ [wishlist][${tag}] Falha ao buscar refId do sku ${skuId}:`, err instanceof Error ? err.message : err);
    return skuId;
  }
}

/** Extrai os SKUs (dedup) de um documento de wishlist. */
export function extractSkus(doc: WishlistDoc): Set<string> {
  const wrappers = doc.ListItemsWrapper;
  if (!wrappers || wrappers.length === 0) return new Set();
  const items = wrappers[0]?.ListItems;
  if (!Array.isArray(items)) return new Set();

  const skus = new Set<string>();
  for (const item of items) {
    if (item?.Sku === null || item?.Sku === undefined) continue;
    const sku = String(item.Sku).trim();
    if (sku) skus.add(sku);
  }
  return skus;
}

// ── Emarsys wishlist/update ──────────────────────────────────────────────────

export type EmarsysWishlistConfig = {
  environmentId: string;
  apiBaseUrl: string;
  oauth2: OAuth2Config;
  /** Field ID usado como chave do contato (default 3 = email, campo de sistema). */
  keyId: number;
  tag: string;
};

type WishlistUpdateResponse = {
  replyCode?: number;
  replyText?: string;
};

export class EmarsysWishlistSender {
  private client: AxiosInstance;

  constructor(private readonly cfg: EmarsysWishlistConfig) {
    this.client = axios.create({
      baseURL: cfg.apiBaseUrl,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(async (request) => {
      const token = await getAccessToken(cfg.environmentId, cfg.oauth2);
      request.headers.Authorization = `Bearer ${token}`;
      return request;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
        if (error.response?.status === 401 && original && !original._retry) {
          original._retry = true;
          invalidateToken(cfg.environmentId);
          const token = await getAccessToken(cfg.environmentId, cfg.oauth2);
          original.headers.Authorization = `Bearer ${token}`;
          return this.client.request(original);
        }
        return Promise.reject(error);
      },
    );
  }

  /** Envia a wishlist de um contato (itens já resolvidos para RefId). */
  async sendWishlist(email: string, refIds: string[]): Promise<void> {
    const body = {
      keyId: this.cfg.keyId,
      events: [
        {
          externalId: email,
          triggerId: randomUUID(),
          eventTime: new Date().toISOString(),
          wishlistContent: refIds.map((itemId) => ({ itemId, quantity: 1 })),
        },
      ],
    };

    const response = await this.client.post<WishlistUpdateResponse>('/api/v3/wishlist/update', body);
    // Mesmo padrão do gateway de contatos: qualquer replyCode != 0 é erro
    const { replyCode, replyText } = response.data ?? {};
    if (replyCode !== undefined && replyCode !== 0) {
      throw new Error(`Emarsys wishlist/update falhou: [${replyCode}] ${replyText}`);
    }
  }
}
