/**
 * Orquestração do sync de pedidos de um environment:
 * VTEX OMS → tabela orders → enriquecimento email/CPF → CSV → Emarsys Sales API.
 *
 * Período incremental via checkpoint em environment_flows (JSONB):
 *   { "lastSyncEnd": "<ISO>" } — próxima execução parte dali (com overlap de
 * 1h para pegar pedidos que mudaram de status). Primeira execução usa
 * settings.lookbackHours (padrão 24h). Substitui os arquivos de checkpoint
 * dos conectores originais.
 *
 * Modo debug (settings.debug = true): busca, persiste e gera CSV, mas NÃO
 * envia à Emarsys nem marca pedidos como sincronizados.
 */

import {
  loadEnvironmentContext,
  markFlowRun,
  updateFlowCheckpoint,
  type EnvironmentContext,
} from '../../tenancy/context.js';
import { startRun, updateRunProgress, completeRun, failRun, hasRunningRun, type RunTrigger } from '../runs.js';
import {
  createOmsClient,
  getAllOrdersInPeriod,
  getOrderById,
  getCustomerEmailByDocument,
  isValidCustomerEmail,
  sha256Hex,
  transformOrderToRows,
  transformRowsForEmarsys,
  type OrdersFlowSettings,
  type VtexOrdersConfig,
} from './service.js';
import { insertOrdersBatch, listPendingSync, markOrdersAsSynced, updateOrderContact, type OrderRecord } from './repo.js';
import { buildSalesCsv, sendSalesCsv } from './salesApi.js';

const OVERLAP_MS = 60 * 60 * 1000; // 1h de sobreposição sobre o checkpoint

function requireVtexConfig(ctx: EnvironmentContext): VtexOrdersConfig {
  const vtex = ctx.connections.vtex;
  if (!vtex) throw new Error('Connection "vtex" não configurada para este environment');
  const baseUrl = vtex.config.baseUrl;
  const appKey = vtex.config.appKey || vtex.secrets.appKey;
  const appToken = vtex.secrets.appToken || vtex.config.appToken;
  if (!baseUrl) throw new Error('Connection "vtex": baseUrl não configurada');
  if (!appKey || !appToken) throw new Error('Connection "vtex": appKey/appToken não configurados');
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    appKey,
    appToken,
    tag: `${ctx.tenantSlug}/${ctx.envSlug}`,
  };
}

export type OrdersSyncOptions = {
  /** Override manual do período (ISO). Sem eles, usa checkpoint/lookback. */
  startDate?: string;
  endDate?: string;
};

export type OrdersSyncResult = {
  success: boolean;
  runId: string;
  fetched?: number;
  inserted?: number;
  updated?: number;
  sent?: number;
  debug?: boolean;
  error?: string;
};

export async function runOrdersSync(
  environmentId: string,
  trigger: RunTrigger,
  options: OrdersSyncOptions = {},
): Promise<OrdersSyncResult> {
  const ctx = await loadEnvironmentContext(environmentId);
  if (!ctx) throw new Error(`Environment ${environmentId} não encontrado`);

  if (await hasRunningRun(environmentId, 'orders')) {
    throw new Error('Já existe um sync de pedidos em andamento para este environment');
  }

  const runId = await startRun(environmentId, 'orders', trigger);
  const flow = ctx.flows.orders;
  const settings = (flow?.settings ?? {}) as OrdersFlowSettings;
  const debug = settings.debug === true;
  const tag = `${ctx.tenantSlug}/${ctx.envSlug}`;

  try {
    const vtexCfg = requireVtexConfig(ctx);
    const client = createOmsClient(vtexCfg);

    // ── Período ──────────────────────────────────────────────────────────────
    const now = new Date();
    const endISO = options.endDate ?? now.toISOString();
    let startISO = options.startDate;
    if (!startISO) {
      const checkpointEnd = flow?.checkpoint?.lastSyncEnd;
      if (typeof checkpointEnd === 'string' && !isNaN(Date.parse(checkpointEnd))) {
        startISO = new Date(Date.parse(checkpointEnd) - OVERLAP_MS).toISOString();
      } else {
        const lookbackHours = settings.lookbackHours ?? 24;
        startISO = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();
      }
    }

    console.log(`🚀 [orders][${tag}] Sync ${startISO} → ${endISO} (trigger: ${trigger}${debug ? ', DEBUG' : ''})`);
    await updateRunProgress(runId, 5);

    // ── 1. Buscar lista de pedidos no OMS ────────────────────────────────────
    const orderList = await getAllOrdersInPeriod(client, tag, startISO, endISO, settings);
    await updateRunProgress(runId, 20);

    // ── 2. Detalhes + transformação em linhas ────────────────────────────────
    const allRows: OrderRecord[] = [];
    for (let i = 0; i < orderList.length; i++) {
      const { orderId } = orderList[i];
      if (!orderId) continue;

      const detail = await getOrderById(client, orderId);
      if (!detail) continue;

      // Email: do pedido, senão CL via CPF
      let email: string | null = null;
      const candidate = detail.clientProfileData?.email || detail.customerEmail;
      if (isValidCustomerEmail(candidate, settings)) {
        email = candidate;
      } else if (detail.clientProfileData?.document) {
        email = await getCustomerEmailByDocument(client, tag, detail.clientProfileData.document, settings);
      }

      allRows.push(...transformOrderToRows(detail, email, settings));

      if ((i + 1) % 25 === 0 || i + 1 === orderList.length) {
        console.log(`📦 [orders][${tag}] Detalhes: ${i + 1}/${orderList.length}`);
        await updateRunProgress(runId, 20 + Math.round(((i + 1) / orderList.length) * 40));
      }
      await new Promise((r) => setTimeout(r, 100)); // rate limit
    }

    // ── 3. Persistir ─────────────────────────────────────────────────────────
    const { inserted, updated } = await insertOrdersBatch(environmentId, allRows);
    console.log(`✅ [orders][${tag}] Banco: ${inserted} inseridos, ${updated} atualizados`);
    await updateRunProgress(runId, 65);

    // ── 4. Enriquecer pendentes sem email/customer (runs anteriores) ─────────
    let pending = await listPendingSync(environmentId, { startDate: startISO, endDate: endISO });
    const toEnrich = pending.filter((o) => !o.email || !o.customer);
    for (const row of toEnrich) {
      try {
        const detail = await getOrderById(client, row.order);
        if (!detail) continue;
        const docDigits = (detail.clientProfileData?.document ?? '').replace(/\D+/g, '');
        const customerHash = docDigits ? sha256Hex(docDigits) : null;

        let email: string | null = null;
        const candidate = detail.clientProfileData?.email || detail.customerEmail;
        if (isValidCustomerEmail(candidate, settings)) {
          email = candidate;
        } else if (docDigits) {
          email = await getCustomerEmailByDocument(client, tag, docDigits, settings);
        }

        if (email && customerHash) {
          await updateOrderContact(environmentId, row.order, row.item, { email, customer: customerHash });
        } else if (customerHash) {
          await updateOrderContact(environmentId, row.order, row.item, { customer: customerHash });
        } else if (email) {
          await updateOrderContact(environmentId, row.order, row.item, { email });
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.warn(`⚠️ [orders][${tag}] Erro ao enriquecer ${row.order}:`, err instanceof Error ? err.message : err);
      }
    }
    if (toEnrich.length > 0) {
      pending = await listPendingSync(environmentId, { startDate: startISO, endDate: endISO });
    }
    await updateRunProgress(runId, 75);

    // ── 5. Transformar + CSV + envio ─────────────────────────────────────────
    const { records, canceledCount, skippedNoCustomer } = transformRowsForEmarsys(pending, settings);
    const { csv, lineCount } = buildSalesCsv(records);

    let sent = 0;
    if (lineCount === 0) {
      console.log(`⚠️ [orders][${tag}] Nenhum pedido válido para enviar`);
    } else if (debug) {
      console.log(`🧪 [orders][${tag}] DEBUG — envio pulado (${lineCount} linhas de CSV geradas)`);
    } else {
      const salesConn = ctx.connections.emarsys_sales_api;
      if (!salesConn) throw new Error('Connection "emarsys_sales_api" não configurada para este environment');
      const oauthConn = ctx.connections.emarsys_oauth2;

      const sendResult = await sendSalesCsv(
        {
          environmentId,
          apiUrl: salesConn.config.apiUrl,
          staticToken: salesConn.secrets.token || undefined,
          oauth2: oauthConn
            ? {
                clientId: oauthConn.config.clientId,
                clientSecret: oauthConn.secrets.clientSecret,
                tokenEndpoint: oauthConn.config.tokenEndpoint,
              }
            : undefined,
          tag,
        },
        csv,
      );

      if (!sendResult.success) {
        throw new Error(`Envio à Sales API falhou: ${sendResult.error}`);
      }

      const sentKeys = records.map((r) => ({ order: r.order, item: r.item }));
      sent = await markOrdersAsSynced(environmentId, sentKeys);
      console.log(`✅ [orders][${tag}] ${sent} itens marcados como sincronizados`);
    }
    await updateRunProgress(runId, 95);

    // ── 6. Checkpoint + status ───────────────────────────────────────────────
    // Em debug o checkpoint não avança — a execução real seguinte reprocessa o período.
    if (!debug) {
      await updateFlowCheckpoint(environmentId, 'orders', { lastSyncEnd: endISO });
    }

    const stats = {
      period: { start: startISO, end: endISO },
      fetched: orderList.length,
      rows: allRows.length,
      inserted,
      updated,
      pendingAfterEnrich: pending.length,
      csvLines: lineCount,
      canceledCount,
      skippedNoCustomer,
      sent,
      debug,
    };
    await completeRun(runId, stats);
    await markFlowRun(environmentId, 'orders', 'success');
    console.log(`🎉 [orders][${tag}] Sync concluído`, stats);
    return { success: true, runId, fetched: orderList.length, inserted, updated, sent, debug };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(runId, message);
    await markFlowRun(environmentId, 'orders', 'error');
    console.error(`❌ [orders][${tag}] Sync falhou: ${message}`);
    return { success: false, runId, error: message };
  }
}
