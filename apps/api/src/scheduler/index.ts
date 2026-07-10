/**
 * Scheduler dinâmico — agenda os flows habilitados lendo environment_flows.
 *
 * Diferente dos conectores originais (cron fixo via env vars), aqui:
 *  - cada environment tem seus próprios crons (cron_expression por flow);
 *  - mudanças feitas no painel são aplicadas em até REFRESH_INTERVAL_MS
 *    (poll no banco — simples e suficiente para 1 instância da API);
 *  - execução registra last_run_at/last_status e sync_runs.
 *
 * Flows suportados: products, orders (Fase 2), contacts (Fase 3) e
 * wishlist (Fase 4).
 */

import { Cron } from 'croner';
import { getPool } from '../db/pool.js';
import type { FlowKey } from '../tenancy/context.js';
import { runProductsSync } from '../modules/products/sync.js';
import { runOrdersSync } from '../modules/orders/sync.js';
import { runContactsSync } from '../modules/contacts/worker.js';
import { runWishlistSync } from '../modules/wishlist/sync.js';

const REFRESH_INTERVAL_MS = 60_000;
const TIMEZONE = process.env.CRON_TIMEZONE ?? 'America/Sao_Paulo';

const RUNNABLE_FLOWS: FlowKey[] = ['products', 'orders', 'contacts', 'wishlist'];

type ScheduledJob = {
  key: string;
  environmentId: string;
  flow: FlowKey;
  tenantSlug: string;
  envSlug: string;
  cronExpression: string;
  job: Cron;
};

const jobs = new Map<string, ScheduledJob>();
const executing = new Set<string>();

let refreshTimer: NodeJS.Timeout | null = null;

async function executeFlow(entry: ScheduledJob): Promise<void> {
  if (executing.has(entry.key)) {
    console.log(`⏭️ [scheduler] ${entry.key} ainda em execução — pulando disparo`);
    return;
  }
  executing.add(entry.key);
  try {
    if (entry.flow === 'products') {
      await runProductsSync(entry.environmentId, 'cron');
    } else if (entry.flow === 'orders') {
      await runOrdersSync(entry.environmentId, 'cron');
    } else if (entry.flow === 'contacts') {
      await runContactsSync(entry.environmentId, 'cron');
    } else if (entry.flow === 'wishlist') {
      await runWishlistSync(entry.environmentId, 'cron');
    }
  } catch (err) {
    console.error(`❌ [scheduler] ${entry.key} falhou:`, err instanceof Error ? err.message : err);
  } finally {
    executing.delete(entry.key);
  }
}

type FlowRow = {
  environment_id: string;
  flow: FlowKey;
  cron_expression: string;
  tenant_slug: string;
  env_slug: string;
};

async function fetchEnabledFlows(): Promise<FlowRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT f.environment_id, f.flow, f.cron_expression,
            t.slug AS tenant_slug, e.slug AS env_slug
     FROM environment_flows f
     JOIN tenant_environments e ON e.id = f.environment_id
     JOIN tenants t ON t.id = e.tenant_id
     WHERE f.enabled = TRUE
       AND f.cron_expression IS NOT NULL AND f.cron_expression <> ''
       AND e.status = 'active' AND t.status = 'active'
       AND f.flow = ANY($1)`,
    [RUNNABLE_FLOWS],
  );
  return rows as FlowRow[];
}

function scheduleJob(row: FlowRow): void {
  const key = `${row.environment_id}:${row.flow}`;
  try {
    const entry: ScheduledJob = {
      key,
      environmentId: row.environment_id,
      flow: row.flow,
      tenantSlug: row.tenant_slug,
      envSlug: row.env_slug,
      cronExpression: row.cron_expression,
      job: null as unknown as Cron,
    };
    entry.job = new Cron(row.cron_expression, { timezone: TIMEZONE, protect: true }, () => executeFlow(entry));
    jobs.set(key, entry);
    console.log(
      `🗓️ [scheduler] Agendado ${row.tenant_slug}/${row.env_slug}:${row.flow} (${row.cron_expression})`,
    );
  } catch (err) {
    console.error(
      `❌ [scheduler] Cron inválido para ${row.tenant_slug}/${row.env_slug}:${row.flow} ("${row.cron_expression}"):`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function refreshSchedules(): Promise<void> {
  const rows = await fetchEnabledFlows();
  const desired = new Map(rows.map((r) => [`${r.environment_id}:${r.flow}`, r]));

  // Remove jobs que sumiram ou mudaram de cron
  for (const [key, entry] of jobs) {
    const row = desired.get(key);
    if (!row || row.cron_expression !== entry.cronExpression) {
      entry.job.stop();
      jobs.delete(key);
      if (!row) console.log(`🗑️ [scheduler] Removido ${entry.tenantSlug}/${entry.envSlug}:${entry.flow}`);
    }
  }

  // Agenda novos/alterados
  for (const [key, row] of desired) {
    if (!jobs.has(key)) scheduleJob(row);
  }
}

export async function startScheduler(): Promise<void> {
  await refreshSchedules();
  refreshTimer = setInterval(() => {
    refreshSchedules().catch((err) =>
      console.error('❌ [scheduler] Erro ao recarregar flows:', err instanceof Error ? err.message : err),
    );
  }, REFRESH_INTERVAL_MS);
  refreshTimer.unref();
  console.log(`✅ [scheduler] Ativo (${jobs.size} job(s), refresh a cada ${REFRESH_INTERVAL_MS / 1000}s)`);
}

export function stopScheduler(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  for (const entry of jobs.values()) entry.job.stop();
  jobs.clear();
}

export type SchedulerJobStatus = {
  environmentId: string;
  flow: FlowKey;
  name: string;
  schedule: string;
  running: boolean;
  nextRun: string | null;
};

/** Snapshot dos jobs agendados (merge com last_run_at é feito na camada HTTP). */
export function getScheduledJobs(): SchedulerJobStatus[] {
  return Array.from(jobs.values()).map((entry) => ({
    environmentId: entry.environmentId,
    flow: entry.flow,
    name: `${entry.tenantSlug}/${entry.envSlug}:${entry.flow}`,
    schedule: entry.cronExpression,
    running: executing.has(entry.key),
    nextRun: entry.job.nextRun()?.toISOString() ?? null,
  }));
}
