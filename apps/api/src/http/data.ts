/**
 * Endpoints de dados consumidos pelo dashboard do painel (contrato da Fase 2).
 *
 * Todos aceitam ?tenant=<slug> — resolve para os environment_ids do tenant e
 * filtra os dados. Sem o parâmetro, visão global (todos os environments).
 *
 * Shapes espelham os mocks do painel (src/app/api/** no modo mock):
 *  - GET /api/emarsys/sales/db-sample        → { orders, total }
 *  - GET /api/emarsys/sales/sync-status      → { total, pending, synced, lastSync, percentSynced }
 *  - GET /api/vtex/products                  → { products }
 *  - GET /api/vtex/products/stats            → { total, lastSync, lastFile, status }
 *  - GET /api/emarsys/contacts/latest        → { contacts }   (vazio até a Fase 3)
 *  - GET /api/metrics/contacts/retry-status  → { total, pending, sent, failed, dead, byClientType }
 *  - GET /api/cron-management/status         → { jobs }
 *  - GET /api/background/jobs                → { jobs }
 *  - GET /api/integration/sync/error-logs    → { errors }
 *  - GET /api/metrics/json                   → { uptime, memory, requests }
 * (o 11º é o /health público, montado no index.ts)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPool } from '../db/pool.js';
import { resolveEnvironmentIds } from '../tenancy/context.js';
import { getScheduledJobs } from '../scheduler/index.js';
import { runProductsSync } from '../modules/products/sync.js';
import { runOrdersSync } from '../modules/orders/sync.js';
import { runContactsSync } from '../modules/contacts/worker.js';
import { runWishlistSync } from '../modules/wishlist/sync.js';
import { listLatest, contactStats } from '../modules/contacts/repo.js';
import { hasRunningRun } from '../modules/runs.js';
import { runInBackground } from '../lib/background.js';

export const dataRouter = Router();

// ── Métricas de requisições (em memória, por processo) ───────────────────────

const requestCounters = { total: 0, errors: 0 };

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  requestCounters.total++;
  res.on('finish', () => {
    if (res.statusCode >= 500) requestCounters.errors++;
  });
  next();
}

export function memorySnapshot(): { used: number; total: number; percent: number } {
  const mem = process.memoryUsage();
  const used = Math.round(mem.heapUsed / 1024 / 1024);
  const total = Math.round(mem.heapTotal / 1024 / 1024);
  return { used, total, percent: total > 0 ? Math.round((used / total) * 100) : 0 };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

function internalError(res: Response, err: unknown): void {
  console.error('❌ Erro interno [data]:', err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: 'Erro interno do servidor', timestamp: ts() });
}

async function envIdsFromReq(req: Request): Promise<string[]> {
  const tenant = typeof req.query.tenant === 'string' && req.query.tenant ? req.query.tenant : undefined;
  return resolveEnvironmentIds(tenant);
}

function intParam(value: unknown, fallback: number, max: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

// ── GET /api/emarsys/sales/db-sample ─────────────────────────────────────────

dataRouter.get('/emarsys/sales/db-sample', async (req: Request, res: Response): Promise<void> => {
  try {
    // Valida datas ANTES de qualquer short-circuit — 400 não pode depender de haver dados
    for (const name of ['startDate', 'endDate'] as const) {
      const value = req.query[name];
      if (typeof value === 'string' && value && isNaN(Date.parse(value))) {
        res.status(400).json({ success: false, error: `${name} inválido`, timestamp: ts() });
        return;
      }
    }

    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ orders: [], total: 0 });
      return;
    }

    const limit = intParam(req.query.limit, 50, 500);
    const offset = intParam(req.query.offset, 0, 1_000_000);

    const where: string[] = ['environment_id = ANY($1)'];
    const params: unknown[] = [envIds];
    let idx = 2;

    if (req.query.isSync === 'true' || req.query.isSync === 'false') {
      where.push(`"isSync" = $${idx++}`);
      params.push(req.query.isSync === 'true');
    }
    for (const [name, op] of [['startDate', '>='], ['endDate', '<=']] as const) {
      const value = req.query[name];
      if (typeof value === 'string' && value) {
        where.push(`timestamp ${op} $${idx++}`);
        params.push(value);
      }
    }
    if (typeof req.query.email === 'string' && req.query.email) {
      where.push(`email ILIKE $${idx++}`);
      params.push(`%${req.query.email}%`);
    }
    if (typeof req.query.customer_id === 'string' && req.query.customer_id) {
      where.push(`customer = $${idx++}`);
      params.push(req.query.customer_id);
    }
    if (typeof req.query.order_status === 'string' && req.query.order_status) {
      where.push(`order_status = $${idx++}`);
      params.push(req.query.order_status);
    }
    if (typeof req.query.s_loja === 'string' && req.query.s_loja) {
      where.push(`s_loja = $${idx++}`);
      params.push(req.query.s_loja);
    }
    if (typeof req.query.s_canal === 'string' && req.query.s_canal) {
      where.push(`s_canal = $${idx++}`);
      params.push(req.query.s_canal);
    }

    const whereSql = where.join(' AND ');
    const pool = getPool();

    const [countRes, rowsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE ${whereSql}`, params),
      pool.query(
        `SELECT id, "order", item, price::float8 AS price, timestamp, customer,
                quantity::float8 AS quantity, s_sales_channel, s_store_id, s_canal, s_loja,
                s_tipo_pagamento, s_cupom, f_valor_desconto, email, "isSync",
                order_status, s_channel_source, s_discount, created_at, updated_at
         FROM orders WHERE ${whereSql}
         ORDER BY timestamp DESC NULLS LAST
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      ),
    ]);

    res.json({ orders: rowsRes.rows, total: (countRes.rows[0] as { count: number }).count });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/emarsys/sales/sync-status ───────────────────────────────────────

dataRouter.get('/emarsys/sales/sync-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ total: 0, pending: 0, synced: 0, lastSync: null, percentSynced: 0 });
      return;
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE "isSync" = FALSE)::int AS pending,
              COUNT(*) FILTER (WHERE "isSync" = TRUE)::int AS synced,
              MAX(updated_at) FILTER (WHERE "isSync" = TRUE) AS "lastSync"
       FROM orders WHERE environment_id = ANY($1)`,
      [envIds],
    );
    const stats = rows[0] as { total: number; pending: number; synced: number; lastSync: Date | null };

    res.json({
      total: stats.total,
      pending: stats.pending,
      synced: stats.synced,
      lastSync: stats.lastSync ? stats.lastSync.toISOString() : null,
      percentSynced: stats.total > 0 ? Math.round((stats.synced / stats.total) * 1000) / 10 : 0,
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/vtex/products ───────────────────────────────────────────────────

dataRouter.get('/vtex/products', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ products: [] });
      return;
    }

    const limit = intParam(req.query.limit, 100, 1000);
    const offset = intParam(req.query.offset, 0, 1_000_000);

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT item, title, link, image, category, available, description,
              price::float8 AS price, msrp::float8 AS msrp, group_id, c_stock, c_sku_id, c_product_id
       FROM products WHERE environment_id = ANY($1)
       ORDER BY item ASC LIMIT $2 OFFSET $3`,
      [envIds, limit, offset],
    );
    res.json({ products: rows });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/vtex/products/stats ─────────────────────────────────────────────

dataRouter.get('/vtex/products/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ total: 0, lastSync: null, lastFile: null, status: 'never' });
      return;
    }

    const pool = getPool();
    const [countRes, runRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM products WHERE environment_id = ANY($1)`, [envIds]),
      pool.query(
        `SELECT status, finished_at, stats FROM sync_runs
         WHERE environment_id = ANY($1) AND flow = 'products' AND status <> 'running'
         ORDER BY started_at DESC LIMIT 1`,
        [envIds],
      ),
    ]);

    const lastRun = runRes.rows[0] as
      | { status: string; finished_at: Date | null; stats: Record<string, unknown> | null }
      | undefined;

    res.json({
      total: (countRes.rows[0] as { count: number }).count,
      lastSync: lastRun?.finished_at ? lastRun.finished_at.toISOString() : null,
      lastFile: (lastRun?.stats?.fileName as string | undefined) ?? null,
      status: !lastRun ? 'never' : lastRun.status === 'completed' ? 'ok' : 'error',
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/emarsys/contacts/latest ─────────────────────────────────────────

dataRouter.get('/emarsys/contacts/latest', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ contacts: [] });
      return;
    }
    const limit = intParam(req.query.limit, 50, 500);
    res.json({ contacts: await listLatest(envIds, limit) });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/metrics/contacts/retry-status ───────────────────────────────────

dataRouter.get('/metrics/contacts/retry-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ total: 0, pending: 0, sent: 0, failed: 0, dead: 0, byClientType: [] });
      return;
    }
    res.json(await contactStats(envIds));
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/cron-management/status ──────────────────────────────────────────

dataRouter.get('/cron-management/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    const envIdSet = new Set(envIds);
    const scheduled = getScheduledJobs().filter((j) => envIdSet.has(j.environmentId));

    // lastRun vem do banco (environment_flows.last_run_at)
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT environment_id, flow, last_run_at FROM environment_flows WHERE environment_id = ANY($1)`,
      [envIds],
    );
    const lastRunByKey = new Map(
      (rows as Array<{ environment_id: string; flow: string; last_run_at: Date | null }>).map((r) => [
        `${r.environment_id}:${r.flow}`,
        r.last_run_at,
      ]),
    );

    res.json({
      jobs: scheduled.map((j) => ({
        name: j.name,
        running: j.running,
        lastRun: lastRunByKey.get(`${j.environmentId}:${j.flow}`)?.toISOString() ?? null,
        nextRun: j.nextRun,
        schedule: j.schedule,
      })),
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/background/jobs ─────────────────────────────────────────────────

const RUN_STATUS_TO_JOB: Record<string, string> = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
};

dataRouter.get('/background/jobs', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ jobs: [] });
      return;
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT r.id, r.flow, r.status, r.progress, r.started_at,
              t.slug AS tenant_slug, e.slug AS env_slug
       FROM sync_runs r
       JOIN tenant_environments e ON e.id = r.environment_id
       JOIN tenants t ON t.id = e.tenant_id
       WHERE r.environment_id = ANY($1)
       ORDER BY r.started_at DESC LIMIT 20`,
      [envIds],
    );

    res.json({
      jobs: (rows as Array<{
        id: string;
        flow: string;
        status: string;
        progress: number;
        started_at: Date;
        tenant_slug: string;
        env_slug: string;
      }>).map((r) => ({
        id: r.id,
        type: `sync-${r.flow} (${r.tenant_slug}/${r.env_slug})`,
        status: RUN_STATUS_TO_JOB[r.status] ?? 'pending',
        startedAt: r.started_at.toISOString(),
        progress: r.progress,
      })),
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/integration/sync/error-logs ─────────────────────────────────────

dataRouter.get('/integration/sync/error-logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const envIds = await envIdsFromReq(req);
    if (envIds.length === 0) {
      res.json({ errors: [] });
      return;
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT r.flow, r.error, r.finished_at, t.slug AS tenant_slug, e.slug AS env_slug
       FROM sync_runs r
       JOIN tenant_environments e ON e.id = r.environment_id
       JOIN tenants t ON t.id = e.tenant_id
       WHERE r.environment_id = ANY($1) AND r.status = 'failed' AND r.error IS NOT NULL
       ORDER BY r.finished_at DESC NULLS LAST LIMIT 20`,
      [envIds],
    );

    res.json({
      errors: (rows as Array<{
        flow: string;
        error: string;
        finished_at: Date | null;
        tenant_slug: string;
        env_slug: string;
      }>).map((r) => ({
        orderId: `${r.tenant_slug}/${r.env_slug}:${r.flow}`,
        message: r.error,
        timestamp: r.finished_at ? r.finished_at.toISOString() : ts(),
      })),
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── GET /api/metrics/json ────────────────────────────────────────────────────

dataRouter.get('/metrics/json', async (_req: Request, res: Response): Promise<void> => {
  const uptime = Math.round(process.uptime());
  res.json({
    uptime,
    memory: memorySnapshot(),
    requests: {
      total: requestCounters.total,
      errors: requestCounters.errors,
      rate: uptime > 0 ? Math.round((requestCounters.total / uptime) * 10) / 10 : 0,
    },
  });
});

// ── POST /api/environments/:envId/flows/:flow/run — disparo manual ───────────

dataRouter.post('/environments/:envId/flows/:flow/run', async (req: Request, res: Response): Promise<void> => {
  const flow = req.params.flow;
  if (flow !== 'products' && flow !== 'orders' && flow !== 'contacts' && flow !== 'wishlist') {
    res.status(400).json({ success: false, error: 'flow inválido — aceitos: products, orders, contacts, wishlist', timestamp: ts() });
    return;
  }

  try {
    const pool = getPool();
    // Só environments ativos (de tenants ativos) podem ser disparados manualmente
    const { rows } = await pool.query(
      `SELECT e.id FROM tenant_environments e
       JOIN tenants t ON t.id = e.tenant_id
       WHERE e.id = $1 AND e.status = 'active' AND t.status = 'active'`,
      [req.params.envId],
    );
    if (!rows[0]) {
      res.status(404).json({ success: false, error: 'Environment não encontrado ou inativo', timestamp: ts() });
      return;
    }

    if (await hasRunningRun(req.params.envId, flow)) {
      res.status(409).json({ success: false, error: `Já existe um sync de ${flow} em andamento`, timestamp: ts() });
      return;
    }

    const envId = req.params.envId;
    const body = (req.body ?? {}) as { startDate?: string; endDate?: string };

    // Background compatível com serverless — progresso em /api/background/jobs
    runInBackground(
      () =>
        flow === 'products'
          ? runProductsSync(envId, 'manual')
          : flow === 'orders'
            ? runOrdersSync(envId, 'manual', { startDate: body.startDate, endDate: body.endDate })
            : flow === 'contacts'
              ? runContactsSync(envId, 'manual')
              : runWishlistSync(envId, 'manual'),
      `run:${flow}`,
    );

    res.status(202).json({
      success: true,
      message: `Sync de ${flow} iniciado em background — acompanhe em /api/background/jobs`,
      timestamp: ts(),
    });
  } catch (err) {
    internalError(res, err);
  }
});
