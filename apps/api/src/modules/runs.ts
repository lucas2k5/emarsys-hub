/**
 * Registro de execuções de sync em sync_runs.
 *
 * Substitui o Map em memória (global.jobStatus) e os logs em arquivo dos
 * conectores originais — sobrevive a restart e alimenta os endpoints de
 * background jobs / error logs do painel.
 */

import { getPool } from '../db/pool.js';
import type { FlowKey } from '../tenancy/context.js';

export type RunTrigger = 'manual' | 'cron';

export async function startRun(
  environmentId: string,
  flow: FlowKey,
  trigger: RunTrigger,
): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO sync_runs (environment_id, flow, trigger, status, progress)
     VALUES ($1, $2, $3, 'running', 0) RETURNING id`,
    [environmentId, flow, trigger],
  );
  return (rows[0] as { id: string }).id;
}

export async function updateRunProgress(runId: string, progress: number): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE sync_runs SET progress = $2 WHERE id = $1', [
    runId,
    Math.max(0, Math.min(100, Math.round(progress))),
  ]);
}

export async function completeRun(runId: string, stats: Record<string, unknown>): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE sync_runs SET status = 'completed', progress = 100, stats = $2, finished_at = NOW()
     WHERE id = $1`,
    [runId, JSON.stringify(stats)],
  );
}

export async function failRun(
  runId: string,
  error: string,
  stats: Record<string, unknown> = {},
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE sync_runs SET status = 'failed', error = $2, stats = $3, finished_at = NOW()
     WHERE id = $1`,
    [runId, error, JSON.stringify(stats)],
  );
}

/** True se já existe run 'running' deste flow neste environment (guarda de sobreposição). */
export async function hasRunningRun(environmentId: string, flow: FlowKey): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM sync_runs
     WHERE environment_id = $1 AND flow = $2 AND status = 'running'
       AND started_at > NOW() - INTERVAL '6 hours'
     LIMIT 1`,
    [environmentId, flow],
  );
  return rows.length > 0;
}

/**
 * Runs 'running' órfãos (ex: processo reiniciou no meio) são marcados como
 * failed no boot — sem isso a guarda de sobreposição travaria o flow por 6h.
 */
export async function failOrphanRuns(): Promise<number> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE sync_runs SET status = 'failed', error = 'Interrompido por restart do serviço',
       finished_at = NOW()
     WHERE status = 'running'`,
  );
  return rowCount ?? 0;
}
