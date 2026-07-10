/**
 * Busca de produtos na VTEX (catálogo completo, ativos + inativos).
 *
 * Porte do motor de produtos do conector de origem, parametrizado por
 * environment: credenciais e URLs vêm da connection `vtex` do banco,
 * nunca de process.env.
 *
 * Fluxo em 3 passos:
 *  1. GetProductAndSkuIds — coleta todos os skuIds paginando
 *  2. products/search em lotes de 50 — SKUs ativos com preço/estoque
 *  3. stockkeepingunitbyid — SKUs que não voltaram no search (inativos/invisíveis)
 */

import axios from 'axios';

export type VtexProductsConfig = {
  baseUrl: string;
  appKey: string;
  appToken: string;
  /** Base do site da loja para montar link de SKUs inativos (DetailUrl é relativo). */
  storeBaseUrl: string;
  /** Tag de log (ex: slug do environment). */
  tag: string;
};

export type ProductRow = {
  item: string;
  title: string;
  link: string;
  image: string;
  category: string;
  available: string;
  description: string;
  price: number | string;
  msrp: number | string;
  group_id: string;
  c_stock: number;
  c_sku_id: string;
  c_product_id: string;
};

const CATEGORIAS_INVALIDAS = ['INATIVO', 'OUT'];

const CONFIG = {
  PAGE_SIZE: 50,
  SEARCH_BATCH_SIZE: 50,
  INACTIVE_BATCH_SIZE: 50,
  DELAY_BETWEEN_PAGES: 200,
  DELAY_BETWEEN_SEARCH_BATCHES: 200,
  DELAY_BETWEEN_INACTIVE_BATCHES: 100,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  RATE_LIMIT_DELAY: 5000,
};

function makeHeaders(appKey: string, appToken: string): Record<string, string> {
  return {
    'X-VTEX-API-AppKey': appKey,
    'X-VTEX-API-AppToken': appToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  tag: string,
  retries = 0,
): Promise<unknown> {
  try {
    const response = await axios.get(url, { headers, timeout: 30_000 });
    return response.data;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;

    if (status === 429) {
      console.log(`[${tag}] 429 rate limit — aguardando ${CONFIG.RATE_LIMIT_DELAY}ms`);
      await sleep(CONFIG.RATE_LIMIT_DELAY);
      return fetchWithRetry(url, headers, tag, retries);
    }

    if (status === 404) return null;

    if (retries < CONFIG.MAX_RETRIES) {
      const code = status ?? (axios.isAxiosError(err) ? err.code : 'ERR');
      console.log(`[${tag}] Erro ${code} — retry ${retries + 1}/${CONFIG.MAX_RETRIES}`);
      await sleep(CONFIG.RETRY_DELAY);
      return fetchWithRetry(url, headers, tag, retries + 1);
    }

    console.warn(`[${tag}] Falha após ${CONFIG.MAX_RETRIES} tentativas: ${url}`);
    return null;
  }
}

function isInvalidCategory(parts: string[]): boolean {
  return parts.some((p) => CATEGORIAS_INVALIDAS.includes(p.trim().replace(/[[\]]/g, '').toUpperCase()));
}

function formatCategoryPath(categoryPath: string | undefined): string {
  if (!categoryPath) return '';
  const parts = categoryPath.split('/').filter(Boolean);
  if (isInvalidCategory(parts)) return '';
  return parts.join(' > ');
}

function formatCategoryFromObject(categories: Record<string, string> | undefined): string {
  if (!categories) return '';
  const parts = Object.values(categories);
  if (isInvalidCategory(parts)) return '';
  return parts.join(' > ');
}

function cleanText(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/\x00/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[•·▪▸►▶–—]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function encodeImageUrl(url: string | undefined): string {
  if (!url) return '';
  return url.replace(/ /g, '%20');
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Passo 1: GetProductAndSkuIds ─────────────────────────────────────────────

async function fetchAllSkuIds(cfg: VtexProductsConfig, headers: Record<string, string>): Promise<number[]> {
  const allSkuIds: number[] = [];
  let from = 1;
  let pageNum = 0;
  let total: number | null = null;

  for (;;) {
    const to = from + CONFIG.PAGE_SIZE - 1;
    pageNum++;
    const url = `${cfg.baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}`;
    const data = (await fetchWithRetry(url, headers, cfg.tag)) as
      | { range?: { total?: number }; data?: Record<string, number[]> }
      | null;

    if (!data || typeof data !== 'object') break;

    if (total === null) {
      total = data.range?.total ?? 0;
      console.log(`[${cfg.tag}] Coletando IDs... total: ${total} produtos`);
    }

    const productData = data.data ?? (data as unknown as Record<string, number[]>);
    const entries = Object.entries(productData).filter(([k]) => k !== 'range');
    if (entries.length === 0) break;

    for (const [, skuIds] of entries) {
      if (Array.isArray(skuIds) && skuIds.length > 0) allSkuIds.push(...skuIds);
    }

    const totalPages = Math.ceil((total ?? 0) / CONFIG.PAGE_SIZE);
    console.log(`[${cfg.tag}] Página ${pageNum}/${totalPages} → ${allSkuIds.length} skuIds`);

    if (total !== null && from + CONFIG.PAGE_SIZE - 1 >= total) break;
    from += CONFIG.PAGE_SIZE;
    await sleep(CONFIG.DELAY_BETWEEN_PAGES);
  }

  const unique = [...new Set(allSkuIds)];
  console.log(`[${cfg.tag}] IDs coletados: ${unique.length} SKUs únicos`);
  return unique;
}

// ── Passo 2: products/search em lotes ────────────────────────────────────────

type VtexSearchProduct = {
  productId: number | string;
  productName?: string;
  link?: string;
  description?: string;
  categories?: string[];
  items?: Array<{
    itemId: number | string;
    referenceId?: Array<{ Value?: string }>;
    images?: Array<{ imageUrl?: string }>;
    sellers?: Array<{
      commertialOffer?: {
        Price?: number;
        ListPrice?: number;
        IsAvailable?: boolean;
        AvailableQuantity?: number;
      };
    }>;
  }>;
};

function mapSearchProductToRows(product: VtexSearchProduct): ProductRow[] {
  if (!product.items || !Array.isArray(product.items)) return [];
  return product.items
    .map((sku) => {
      const offer = sku.sellers?.[0]?.commertialOffer;
      if (!offer) return null;
      const refId = sku.referenceId?.[0]?.Value || String(sku.itemId);
      return {
        item: refId,
        title: product.productName || '',
        link: product.link || '',
        image: encodeImageUrl(sku.images?.[0]?.imageUrl),
        category: formatCategoryPath(product.categories?.[0]),
        available: String(offer.IsAvailable ?? false),
        description: cleanText(product.description),
        price: offer.Price ?? '',
        msrp: offer.ListPrice ?? '',
        group_id: String(product.productId),
        c_stock: offer.AvailableQuantity ?? 0,
        c_sku_id: String(sku.itemId),
        c_product_id: String(product.productId),
      } satisfies ProductRow;
    })
    .filter((r): r is ProductRow => r !== null);
}

async function fetchActiveProductRows(
  allSkuIds: number[],
  cfg: VtexProductsConfig,
  headers: Record<string, string>,
): Promise<ProductRow[]> {
  const batches = chunkArray(allSkuIds, CONFIG.SEARCH_BATCH_SIZE);
  const rows: ProductRow[] = [];
  const totalBatches = batches.length;

  console.log(`[${cfg.tag}] Buscando ativos via products/search...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const queryString = batch.map((id) => `fq=skuId:${id}`).join('&');
    const url = `${cfg.baseUrl}/api/catalog_system/pub/products/search?${queryString}`;

    const products = (await fetchWithRetry(url, headers, cfg.tag)) as VtexSearchProduct[] | null;
    if (Array.isArray(products)) {
      for (const product of products) rows.push(...mapSearchProductToRows(product));
    }

    if ((i + 1) % 100 === 0 || i + 1 === totalBatches) {
      console.log(`[${cfg.tag}] ${rows.length} SKUs ativos encontrados (lote ${i + 1}/${totalBatches})`);
    }

    if (i + 1 < batches.length) await sleep(CONFIG.DELAY_BETWEEN_SEARCH_BATCHES);
  }

  return rows;
}

// ── Passo 3: stockkeepingunitbyid para inativos ──────────────────────────────

type VtexSkuDetails = {
  Id: number | string;
  ProductId: number | string;
  ProductName?: string;
  ProductDescription?: string;
  ProductRefId?: string;
  SkuName?: string;
  DetailUrl?: string;
  IsActive?: boolean;
  AlternateIds?: { RefId?: string };
  Images?: Array<{ ImageUrl?: string }>;
  ProductCategories?: Record<string, string>;
};

function mapSkuDetailsToRow(sku: VtexSkuDetails, storeBaseUrl: string): ProductRow {
  const refId = sku.AlternateIds?.RefId || (sku.ProductRefId ?? '') + (sku.SkuName ?? '') || String(sku.Id);
  return {
    item: refId,
    title: sku.ProductName || '',
    link: storeBaseUrl + (sku.DetailUrl || ''),
    image: encodeImageUrl(sku.Images?.[0]?.ImageUrl),
    category: formatCategoryFromObject(sku.ProductCategories),
    available: String(sku.IsActive ?? false),
    description: cleanText(sku.ProductDescription),
    price: '',
    msrp: '',
    group_id: String(sku.ProductId),
    c_stock: 0,
    c_sku_id: String(sku.Id),
    c_product_id: String(sku.ProductId),
  };
}

async function fetchInactiveProductRows(
  inactiveSkuIds: number[],
  cfg: VtexProductsConfig,
  headers: Record<string, string>,
): Promise<ProductRow[]> {
  const rows: ProductRow[] = [];
  let errors = 0;
  const total = inactiveSkuIds.length;

  console.log(`[${cfg.tag}] ${total} SKUs inativos para buscar via stockkeepingunitbyid`);

  for (let i = 0; i < inactiveSkuIds.length; i += CONFIG.INACTIVE_BATCH_SIZE) {
    const batch = inactiveSkuIds.slice(i, i + CONFIG.INACTIVE_BATCH_SIZE);

    const results = await Promise.all(
      batch.map((id) =>
        fetchWithRetry(`${cfg.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${id}`, headers, cfg.tag),
      ),
    );

    for (const sku of results as Array<VtexSkuDetails | null>) {
      if (sku && sku.Id) {
        rows.push(mapSkuDetailsToRow(sku, cfg.storeBaseUrl));
      } else {
        errors++;
      }
    }

    const processed = Math.min(i + CONFIG.INACTIVE_BATCH_SIZE, total);
    if (processed % 5000 < CONFIG.INACTIVE_BATCH_SIZE || processed === total) {
      const suffix = processed === total && errors > 0 ? ` (${errors} erros ignorados)` : '';
      console.log(`[${cfg.tag}] Inativos: ${processed}/${total} processados${suffix}`);
    }

    if (i + CONFIG.INACTIVE_BATCH_SIZE < inactiveSkuIds.length) await sleep(CONFIG.DELAY_BETWEEN_INACTIVE_BATCHES);
  }

  return rows;
}

// ── Fluxo completo ───────────────────────────────────────────────────────────

export async function fetchAllProductRows(cfg: VtexProductsConfig): Promise<ProductRow[]> {
  const headers = makeHeaders(cfg.appKey, cfg.appToken);

  const allSkuIds = await fetchAllSkuIds(cfg, headers);
  const activeRows = await fetchActiveProductRows(allSkuIds, cfg, headers);

  const returnedSkuIds = new Set(activeRows.map((r) => String(r.item)));
  const inactiveSkuIds = allSkuIds.filter((id) => !returnedSkuIds.has(String(id)));
  const inactiveRows = await fetchInactiveProductRows(inactiveSkuIds, cfg, headers);

  // Dedupe por item — mantém a versão ativa quando houver conflito
  const map = new Map<string, ProductRow>();
  for (const row of activeRows) map.set(String(row.item), row);
  for (const row of inactiveRows) {
    if (!map.has(String(row.item))) map.set(String(row.item), row);
  }
  const allRows = Array.from(map.values());

  const duplicates = activeRows.length + inactiveRows.length - allRows.length;
  if (duplicates > 0) console.log(`[${cfg.tag}] ${duplicates} duplicatas removidas (mantida versão ativa)`);

  console.log(
    `[${cfg.tag}] Concluído: ${activeRows.length} ativos + ${inactiveRows.length} inativos = ${allRows.length} SKUs total`,
  );
  return allRows;
}
