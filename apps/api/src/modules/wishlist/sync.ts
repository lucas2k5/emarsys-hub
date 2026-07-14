/**
 * Orquestração do sync de wishlist de um environment.
 *
 * Incremental de verdade: o checkpoint (environment_flows.checkpoint.lastUpdatedIn)
 * filtra o scroll do Master Data — só documentos com updatedIn posterior são
 * varridos — e avança para o maior updatedIn processado ao final da execução.
 * (No conector de origem o checkpoint existia mas não filtrava nada.)
 *
 * Modo debug (settings.debug = true): coleta e resolve RefIds, mas NÃO envia
 * à Emarsys e NÃO avança o checkpoint.
 */

import {
  loadEnvironmentContext,
  markFlowRun,
  updateFlowCheckpoint,
  type EnvironmentContext,
} from '../../tenancy/context.js';
import { startRun, updateRunProgress, completeRun, failRun, hasRunningRun, type RunTrigger } from '../runs.js';
import {
  createVtexMdClient,
  scrollWishlists,
  fetchRefId,
  extractSkus,
  EmarsysWishlistSender,
  type WishlistDoc,
  type WishlistVtexConfig,
} from './service.js';

const DEFAULT_INITIAL_CHECKPOINT = '2024-01-01T00:00:00Z';

export type WishlistFlowSettings = {
  debug?: boolean;
  /** Entidade do Master Data (default: wishlist). */
  entity?: string;
  pageSize?: number;
  /** Field ID da chave de contato no wishlist/update (default 3 = email). */
  keyId?: number;
  /** Checkpoint inicial quando nunca sincronizou. */
  initialCheckpoint?: string;
  requestDelayMs?: number;
};

function requireVtexConfig(ctx: EnvironmentContext): WishlistVtexConfig {
  const vtex = ctx.connections.vtex;
  if (!vtex) throw new Error('Connection "vtex" não configurada para este environment');
  // Master Data usa endpoint próprio, com fallback pro baseUrl legado
  const baseUrl = vtex.config.masterDataEndpoint || vtex.config.baseUrl;
  const appKey = vtex.config.appKey || vtex.secrets.appKey;
  const appToken = vtex.secrets.appToken || vtex.config.appToken;
  if (!baseUrl) throw new Error('Connection "vtex": Endpoint Master Data não configurado');
  if (!appKey || !appToken) throw new Error('Connection "vtex": appKey/appToken não configurados');
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    appKey,
    appToken,
    tag: `${ctx.tenantSlug}/${ctx.envSlug}`,
  };
}

export type WishlistSyncResult = {
  success: boolean;
  runId: string;
  collected?: number;
  sent?: number;
  errors?: number;
  checkpoint?: string;
  debug?: boolean;
  error?: string;
};

export async function runWishlistSync(
  environmentId: string,
  trigger: RunTrigger,
): Promise<WishlistSyncResult> {
  const ctx = await loadEnvironmentContext(environmentId);
  if (!ctx) throw new Error(`Environment ${environmentId} não encontrado`);

  if (await hasRunningRun(environmentId, 'wishlist')) {
    throw new Error('Já existe um sync de wishlist em andamento para este environment');
  }

  const runId = await startRun(environmentId, 'wishlist', trigger);
  const flow = ctx.flows.wishlist;
  const settings = (flow?.settings ?? {}) as WishlistFlowSettings;
  const debug = settings.debug === true;
  const entity = settings.entity || 'wishlist';
  const pageSize = settings.pageSize ?? 1000;
  const requestDelayMs = settings.requestDelayMs ?? 75;
  const tag = `${ctx.tenantSlug}/${ctx.envSlug}`;

  try {
    const vtexCfg = requireVtexConfig(ctx);
    const md = createVtexMdClient(vtexCfg);

    // ── Checkpoint ───────────────────────────────────────────────────────────
    const stored = flow?.checkpoint?.lastUpdatedIn;
    const checkpointISO =
      typeof stored === 'string' && !isNaN(Date.parse(stored))
        ? stored
        : settings.initialCheckpoint || DEFAULT_INITIAL_CHECKPOINT;

    console.log(`🚀 [wishlist][${tag}] Sync incremental desde ${checkpointISO} (trigger: ${trigger}${debug ? ', DEBUG' : ''})`);
    await updateRunProgress(runId, 5);

    // ── Fase 1: scroll com filtro por checkpoint ─────────────────────────────
    const allDocs: WishlistDoc[] = [];
    let latestUpdatedIn = checkpointISO;
    let mdToken: string | null = null;

    for (;;) {
      const page = await scrollWishlists(md, entity, checkpointISO, pageSize, mdToken);
      if (page.docs.length === 0) break;

      allDocs.push(...page.docs);
      if (!mdToken && page.mdToken) mdToken = page.mdToken;

      for (const doc of page.docs) {
        if (doc.updatedIn && Date.parse(doc.updatedIn) > Date.parse(latestUpdatedIn)) {
          latestUpdatedIn = doc.updatedIn;
        }
      }

      console.log(`📥 [wishlist][${tag}] Coletadas ${allDocs.length} wishlists até agora...`);
      if (page.docs.length < pageSize) break;
      await new Promise((r) => setTimeout(r, requestDelayMs));
    }

    if (allDocs.length === 0) {
      const stats = { collected: 0, sent: 0, errors: 0, checkpoint: checkpointISO, debug };
      await completeRun(runId, stats);
      await markFlowRun(environmentId, 'wishlist', 'success');
      console.log(`✅ [wishlist][${tag}] Nada novo desde o checkpoint`);
      return { success: true, runId, ...stats };
    }
    await updateRunProgress(runId, 35);

    // ── Fase 2: resolução SKU → RefId com cache por execução ─────────────────
    const uniqueSkus = new Set<string>();
    for (const doc of allDocs) {
      for (const sku of extractSkus(doc)) uniqueSkus.add(sku);
    }

    console.log(`🔎 [wishlist][${tag}] Resolvendo RefIds de ${uniqueSkus.size} SKUs únicos...`);
    const refIdCache = new Map<string, string>();
    let resolved = 0;
    for (const sku of uniqueSkus) {
      refIdCache.set(sku, await fetchRefId(md, sku, tag));
      resolved++;
      if (resolved % 100 === 0) {
        console.log(`🔎 [wishlist][${tag}] ${resolved}/${uniqueSkus.size} SKUs resolvidos`);
        await updateRunProgress(runId, 35 + Math.round((resolved / uniqueSkus.size) * 30));
      }
      await new Promise((r) => setTimeout(r, requestDelayMs));
    }
    await updateRunProgress(runId, 65);

    // ── Fase 3: envio por wishlist ───────────────────────────────────────────
    let sender: EmarsysWishlistSender | null = null;
    if (!debug) {
      const oauthConn = ctx.connections.emarsys_oauth2;
      if (!oauthConn) throw new Error('Connection "emarsys_oauth2" não configurada para este environment');
      const oauth2 = {
        clientId: oauthConn.config.clientId,
        clientSecret: oauthConn.secrets.clientSecret,
        tokenEndpoint: oauthConn.config.tokenEndpoint || 'https://auth.emarsys.net/oauth2/token',
      };
      if (!oauth2.clientId || !oauth2.clientSecret) {
        throw new Error('Connection "emarsys_oauth2": clientId/clientSecret não configurados');
      }
      sender = new EmarsysWishlistSender({
        environmentId,
        apiBaseUrl: oauthConn.config.apiBaseUrl || 'https://api.emarsys.net',
        oauth2,
        keyId: settings.keyId ?? 3,
        tag,
      });
    }

    let sent = 0;
    let errors = 0;
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i];
      const email = doc.email?.trim();
      if (!email) continue;

      const skus = extractSkus(doc);
      if (skus.size === 0) continue;

      const refIds = [...new Set([...skus].map((sku) => refIdCache.get(sku) ?? sku))];

      try {
        if (debug) {
          console.log(`🧪 [wishlist][${tag}] DEBUG — envio pulado (${email}, ${refIds.length} itens)`);
        } else {
          await sender!.sendWishlist(email, refIds);
        }
        sent++;
      } catch (err) {
        errors++;
        console.error(`❌ [wishlist][${tag}] Falha ao enviar wishlist de ${email}:`, err instanceof Error ? err.message : err);
      }

      if ((i + 1) % 50 === 0 || i + 1 === allDocs.length) {
        await updateRunProgress(runId, 65 + Math.round(((i + 1) / allDocs.length) * 30));
      }
      await new Promise((r) => setTimeout(r, requestDelayMs));
    }

    // ── Checkpoint avança só em execução real ────────────────────────────────
    if (!debug) {
      await updateFlowCheckpoint(environmentId, 'wishlist', { lastUpdatedIn: latestUpdatedIn });
    }

    const stats = { collected: allDocs.length, sent, errors, checkpoint: latestUpdatedIn, debug };
    await completeRun(runId, stats);
    await markFlowRun(environmentId, 'wishlist', 'success');
    console.log(`🎉 [wishlist][${tag}] Sync concluído`, stats);
    return { success: true, runId, ...stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(runId, message);
    await markFlowRun(environmentId, 'wishlist', 'error');
    console.error(`❌ [wishlist][${tag}] Sync falhou: ${message}`);
    return { success: false, runId, error: message };
  }
}
