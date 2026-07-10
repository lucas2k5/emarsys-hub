/**
 * Fila de contatos em Postgres (tabela contacts = registro + fila).
 *
 * Claim com FOR UPDATE SKIP LOCKED — seguro para múltiplos workers.
 * Backoff exponencial via next_attempt_at; esgotadas as tentativas o registro
 * vira 'dead' (dead-letter auditável — reprocessar = voltar status a 'pending').
 */

import { getPool } from '../../db/pool.js';
import type { ContactPayload } from './types.js';

export type ContactRow = {
  id: number;
  environment_id: string;
  customer_id: string | null;
  email: string | null;
  cpf: string | null;
  payload: ContactPayload;
  fan_out: boolean;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'dead';
  attempts: number;
  last_error: string | null;
};

function fmtDate(d: Date | null | undefined): string | null {
  return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export async function enqueueContact(
  environmentId: string,
  payload: ContactPayload,
  fanOut = false,
): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO contacts (
       environment_id, customer_id, email, cpf, first_name, last_name, bday,
       phone, mobile, gender, address, city, state, country, postal_code,
       opt_in, payload, fan_out, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending')
     RETURNING id`,
    [
      environmentId,
      payload.customer_id ?? null,
      payload.email ?? null,
      payload.cpf ?? null,
      payload.first_name ?? null,
      payload.last_name ?? null,
      fmtDate(payload.bday),
      payload.phone ?? null,
      payload.mobile ?? null,
      payload.gender ?? null,
      payload.address ?? null,
      payload.city ?? null,
      payload.state ?? null,
      payload.country != null ? String(payload.country) : null,
      payload.postal_code ?? null,
      payload.opt_in ?? null,
      JSON.stringify(payload),
      fanOut,
    ],
  );
  return (rows[0] as { id: number }).id;
}

/**
 * Reivindica um lote de contatos elegíveis (pending/failed com next_attempt_at
 * vencido), marcando-os como 'processing' atomicamente.
 */
export async function claimBatch(environmentId: string, batchSize: number): Promise<ContactRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE contacts SET status = 'processing', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM contacts
       WHERE environment_id = $1
         AND status IN ('pending','failed')
         AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, environment_id, customer_id, email, cpf, payload, fan_out, status, attempts, last_error`,
    [environmentId, batchSize],
  );
  return rows as ContactRow[];
}

export async function markSent(contactId: number): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE contacts SET status = 'sent', last_error = NULL, updated_at = NOW() WHERE id = $1`,
    [contactId],
  );
}

/**
 * Registra falha: incrementa attempts e agenda a próxima tentativa com
 * backoff exponencial; esgotado o limite, vira 'dead'.
 */
export async function markFailed(
  contactId: number,
  error: string,
  opts: { maxAttempts: number; backoffBaseSeconds: number },
): Promise<'failed' | 'dead'> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE contacts SET
       attempts = attempts + 1,
       last_error = $2,
       status = CASE WHEN attempts + 1 >= $3 THEN 'dead' ELSE 'failed' END,
       -- teto de 30 dias: sem LEAST, attempts alto estoura o range do interval
       next_attempt_at = NOW() + make_interval(secs => LEAST($4 * POWER(2, attempts), 2592000)),
       updated_at = NOW()
     WHERE id = $1
     RETURNING status`,
    [contactId, error.slice(0, 2000), opts.maxAttempts, opts.backoffBaseSeconds],
  );
  return (rows[0] as { status: 'failed' | 'dead' }).status;
}

/**
 * Runs interrompidos no meio (restart) voltam pra fila.
 * Escopado por environment — sem isso um worker resetaria itens legitimamente
 * em 'processing' de OUTRO environment (processamento duplicado).
 */
export async function releaseStuckProcessing(environmentId: string, olderThanMinutes = 30): Promise<number> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE contacts SET status = 'failed', updated_at = NOW()
     WHERE environment_id = $1 AND status = 'processing'
       AND updated_at < NOW() - make_interval(mins => $2)`,
    [environmentId, olderThanMinutes],
  );
  return rowCount ?? 0;
}

// ── Consultas do painel ──────────────────────────────────────────────────────

export async function listLatest(envIds: string[], limit: number): Promise<unknown[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.id, c.customer_id, e.slug AS client_type, c.email, c.cpf,
            c.first_name, c.last_name, c.bday, c.phone, c.mobile, c.gender,
            c.address, c.city, c.state, c.country, c.postal_code, c.opt_in,
            c.payload::text AS payload, c.status, c.attempts, c.last_error,
            c.created_at, c.updated_at
     FROM contacts c
     JOIN tenant_environments e ON e.id = c.environment_id
     WHERE c.environment_id = ANY($1)
     ORDER BY c.created_at DESC
     LIMIT $2`,
    [envIds, limit],
  );
  return rows;
}

export async function contactStats(envIds: string[]): Promise<{
  total: number;
  pending: number;
  sent: number;
  failed: number;
  dead: number;
  byClientType: Array<{ client_type: string; status: string; count: number }>;
}> {
  const pool = getPool();
  const [summary, byType] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS pending,
              COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
              COUNT(*) FILTER (WHERE status = 'dead')::int AS dead
       FROM contacts WHERE environment_id = ANY($1)`,
      [envIds],
    ),
    pool.query(
      `SELECT e.slug AS client_type, c.status, COUNT(*)::int AS count
       FROM contacts c
       JOIN tenant_environments e ON e.id = c.environment_id
       WHERE c.environment_id = ANY($1)
       GROUP BY e.slug, c.status`,
      [envIds],
    ),
  ]);
  const s = summary.rows[0] as { total: number; pending: number; sent: number; failed: number; dead: number };
  return { ...s, byClientType: byType.rows as Array<{ client_type: string; status: string; count: number }> };
}
