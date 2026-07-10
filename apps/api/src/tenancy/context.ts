/**
 * Contexto de environment para os motores de sync (Fase 2+).
 *
 * Carrega environment + conexões (com secrets DESCRIPTOGRAFADOS — uso
 * estritamente interno, nunca serializar numa resposta HTTP) + flows.
 */

import { getPool } from '../db/pool.js';
import { decryptSecrets } from './crypto.js';

export type ConnectionKind =
  | 'vtex'
  | 'vtex_io_app'
  | 'emarsys_oauth2'
  | 'emarsys_wsse'
  | 'emarsys_sales_api'
  | 'sftp_products'
  | 'contacts_webhook';

export type FlowKey = 'products' | 'orders' | 'contacts' | 'wishlist';

export type ResolvedConnection = {
  config: Record<string, string>;
  secrets: Record<string, string>;
};

export type ResolvedFlow = {
  enabled: boolean;
  cronExpression: string | null;
  settings: Record<string, unknown>;
  checkpoint: Record<string, unknown> | null;
};

export type EnvironmentContext = {
  environmentId: string;
  envSlug: string;
  envName: string;
  tenantId: string;
  tenantSlug: string;
  connections: Partial<Record<ConnectionKind, ResolvedConnection>>;
  flows: Partial<Record<FlowKey, ResolvedFlow>>;
};

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}

export async function loadEnvironmentContext(environmentId: string): Promise<EnvironmentContext | null> {
  const pool = getPool();

  const { rows: envRows } = await pool.query(
    `SELECT e.id, e.slug, e.name, e.tenant_id AS "tenantId", t.slug AS "tenantSlug"
     FROM tenant_environments e
     JOIN tenants t ON t.id = e.tenant_id
     WHERE e.id = $1`,
    [environmentId],
  );
  const env = envRows[0] as
    | { id: string; slug: string; name: string; tenantId: string; tenantSlug: string }
    | undefined;
  if (!env) return null;

  const [{ rows: connRows }, { rows: flowRows }] = await Promise.all([
    pool.query(
      'SELECT kind, config, secrets FROM environment_connections WHERE environment_id = $1',
      [environmentId],
    ),
    pool.query(
      `SELECT flow, enabled, cron_expression AS "cronExpression", settings, checkpoint
       FROM environment_flows WHERE environment_id = $1`,
      [environmentId],
    ),
  ]);

  const connections: EnvironmentContext['connections'] = {};
  for (const row of connRows as Array<{ kind: ConnectionKind; config: unknown; secrets: string | null }>) {
    let secrets: Record<string, string> = {};
    if (row.secrets) {
      secrets = asStringRecord(decryptSecrets(row.secrets));
    }
    connections[row.kind] = { config: asStringRecord(row.config), secrets };
  }

  const flows: EnvironmentContext['flows'] = {};
  for (const row of flowRows as Array<{
    flow: FlowKey;
    enabled: boolean;
    cronExpression: string | null;
    settings: Record<string, unknown> | null;
    checkpoint: Record<string, unknown> | null;
  }>) {
    flows[row.flow] = {
      enabled: row.enabled,
      cronExpression: row.cronExpression,
      settings: row.settings ?? {},
      checkpoint: row.checkpoint,
    };
  }

  return {
    environmentId: env.id,
    envSlug: env.slug,
    envName: env.name,
    tenantId: env.tenantId,
    tenantSlug: env.tenantSlug,
    connections,
    flows,
  };
}

/**
 * Resolve os environment_ids visíveis para um filtro de dados.
 * Apenas tenants E environments ativos — dados de ambientes desativados não
 * aparecem no dashboard (consistente com o scheduler, que também os ignora).
 * - tenantSlug informado → environments ativos daquele tenant (inexistente/inativo → []).
 * - sem tenantSlug → todos os environments ativos (visão global do admin).
 */
export async function resolveEnvironmentIds(tenantSlug?: string): Promise<string[]> {
  const pool = getPool();
  if (tenantSlug) {
    const { rows } = await pool.query(
      `SELECT e.id FROM tenant_environments e
       JOIN tenants t ON t.id = e.tenant_id
       WHERE t.slug = $1 AND t.status = 'active' AND e.status = 'active'`,
      [tenantSlug],
    );
    return rows.map((r: { id: string }) => r.id);
  }
  const { rows } = await pool.query(
    `SELECT e.id FROM tenant_environments e
     JOIN tenants t ON t.id = e.tenant_id
     WHERE t.status = 'active' AND e.status = 'active'`,
  );
  return rows.map((r: { id: string }) => r.id);
}

/**
 * Atualiza checkpoint de um flow (merge raso sobre o JSONB existente).
 * ATENÇÃO: chaves antigas não presentes no patch são preservadas — se o schema
 * do checkpoint mudar (ex: renomear lastSyncEnd), limpar a chave legada
 * explicitamente ou trocar o merge por SET completo.
 */
export async function updateFlowCheckpoint(
  environmentId: string,
  flow: FlowKey,
  patch: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE environment_flows
     SET checkpoint = COALESCE(checkpoint, '{}'::jsonb) || $3::jsonb, updated_at = NOW()
     WHERE environment_id = $1 AND flow = $2`,
    [environmentId, flow, JSON.stringify(patch)],
  );
}

/** Registra resultado de execução no flow (last_run_at / last_status). */
export async function markFlowRun(
  environmentId: string,
  flow: FlowKey,
  status: 'success' | 'error',
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE environment_flows
     SET last_run_at = NOW(), last_status = $3, updated_at = NOW()
     WHERE environment_id = $1 AND flow = $2`,
    [environmentId, flow, status],
  );
}
