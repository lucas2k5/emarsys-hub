/**
 * Trilha de auditoria de integração (integration_events).
 *
 * logIntegrationEvent() grava cada interação com sistema externo: payload
 * enviado, resposta/erro, status e latência. NUNCA lança — auditoria não pode
 * derrubar um sync.
 *
 * Privacidade (aplicada na gravação):
 *  - chaves sensíveis (authorization, password, token, secret...) são removidas;
 *  - CPFs em qualquer string/campo são mascarados: ***.***.XXX-XX;
 *  - hashes sha256 (ex: customer_id) são PRESERVADOS íntegros — decisão de
 *    produto: o hash não é reversível e é a chave de rastreio na Emarsys.
 *
 * Retenção (LGPD-friendly): purgeOldEvents() remove info/warn > 30d e
 * error > 90d (configurável via AUDIT_RETENTION_DAYS / AUDIT_ERROR_RETENTION_DAYS).
 */

import { getPool } from '../db/pool.js';
import type { FlowKey } from '../tenancy/context.js';

const SENSITIVE_KEYS = /^(authorization|auth|password|passwd|secret|token|apikey|api_key|apptoken|app_token|client_secret|x-vtex-api-apptoken)$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
// CPF: 11 dígitos com ou sem pontuação, isolado (boundaries impedem match dentro de hashes)
const CPF_RE = /\b(\d{3})\.?(\d{3})\.?(\d{3})[-.]?(\d{2})\b/g;

function maskCpfInString(value: string): string {
  if (SHA256_RE.test(value)) return value; // hash íntegro
  return value.replace(CPF_RE, '***.***.$3-$4');
}

/** Sanitiza recursivamente: remove chaves sensíveis, mascara CPFs, limita profundidade. */
export function sanitizePayload(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth > 6) return '[profundidade máxima]';
  if (typeof input === 'string') {
    const masked = maskCpfInString(input);
    return masked.length > 4000 ? `${masked.slice(0, 4000)}… [truncado ${masked.length} chars]` : masked;
  }
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) {
    const arr = input.slice(0, 50).map((v) => sanitizePayload(v, depth + 1));
    if (input.length > 50) arr.push(`… [+${input.length - 50} itens]`);
    return arr;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        out[key] = '[removido]';
      } else if (/^(cpf|document)$/i.test(key) && typeof value === 'string') {
        out[key] = maskCpfInString(value);
      } else {
        out[key] = sanitizePayload(value, depth + 1);
      }
    }
    return out;
  }
  return String(input);
}

export type IntegrationEvent = {
  environmentId: string;
  flow: FlowKey;
  direction?: 'outbound' | 'inbound';
  level?: 'info' | 'warn' | 'error';
  event: string;
  subject?: string | null;
  request?: unknown;
  response?: unknown;
  statusCode?: number | null;
  durationMs?: number | null;
  runId?: string | null;
};

export async function logIntegrationEvent(e: IntegrationEvent): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO integration_events
         (environment_id, run_id, flow, direction, level, event, subject,
          request_payload, response_payload, status_code, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        e.environmentId,
        e.runId ?? null,
        e.flow,
        e.direction ?? 'outbound',
        e.level ?? 'info',
        e.event,
        e.subject ?? null,
        e.request !== undefined ? JSON.stringify(sanitizePayload(e.request)) : null,
        e.response !== undefined ? JSON.stringify(sanitizePayload(e.response)) : null,
        e.statusCode ?? null,
        e.durationMs ?? null,
      ],
    );
  } catch (err) {
    // Auditoria jamais derruba o fluxo principal
    console.error('⚠️ [audit] Falha ao gravar evento:', err instanceof Error ? err.message : err);
  }
}

/** Purga por idade — chamada no tick do scheduler. */
export async function purgeOldEvents(): Promise<{ purged: number }> {
  const infoDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 30);
  const errorDays = Number(process.env.AUDIT_ERROR_RETENTION_DAYS ?? 90);
  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM integration_events
       WHERE (level <> 'error' AND created_at < NOW() - make_interval(days => $1))
          OR (level = 'error' AND created_at < NOW() - make_interval(days => $2))`,
      [infoDays, errorDays],
    );
    if (rowCount) console.log(`🧹 [audit] ${rowCount} eventos antigos purgados`);
    return { purged: rowCount ?? 0 };
  } catch (err) {
    console.error('⚠️ [audit] Falha na purga:', err instanceof Error ? err.message : err);
    return { purged: 0 };
  }
}
