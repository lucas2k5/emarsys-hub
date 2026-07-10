/**
 * Webhook público de contatos (Fase 3).
 *
 * POST /webhooks/contacts/:tenantSlug
 *
 * Auth: o valor do header Authorization (ou X-Webhook-Token) deve bater com o
 * secret `authHeader` da connection contacts_webhook de pelo menos um
 * environment ativo do tenant — esses environments são os alvos autorizados.
 *
 * Fan-out (substitui o client_type 'full' hardcoded do conector de origem):
 *  - payload.environment = "<slug>"  → só aquele environment
 *  - payload.client_type = "<slug>"  → idem (compatibilidade com o legado;
 *    slugs de environment reproduzem os valores antigos como DADO)
 *  - payload.client_type = "full" ou nada → TODOS os environments autorizados
 *
 * O contato entra na fila (status pending) e responde 202 — o worker do flow
 * "contacts" processa com dedupe, backoff e dead-letter. Um processamento é
 * disparado imediatamente em background para latência baixa.
 */

import { Router, type Request, type Response } from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { contactPayloadSchema } from '../modules/contacts/types.js';
import { enqueueContact } from '../modules/contacts/repo.js';
import { runContactsSync } from '../modules/contacts/worker.js';
import { decryptSecrets } from '../tenancy/crypto.js';
import { runInBackground } from '../lib/background.js';

export const webhooksRouter = Router();

function ts(): string {
  return new Date().toISOString();
}

// Compara hashes de tamanho fixo — sem early-return por comprimento, que
// vazaria o tamanho do token esperado via timing.
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

type WebhookTarget = {
  environmentId: string;
  envSlug: string;
  authHeader: string | null;
};

async function loadWebhookTargets(tenantSlug: string): Promise<WebhookTarget[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT e.id AS environment_id, e.slug AS env_slug, c.secrets
     FROM tenant_environments e
     JOIN tenants t ON t.id = e.tenant_id
     JOIN environment_connections c ON c.environment_id = e.id AND c.kind = 'contacts_webhook'
     JOIN environment_flows f ON f.environment_id = e.id AND f.flow = 'contacts' AND f.enabled = TRUE
     WHERE t.slug = $1 AND t.status = 'active' AND e.status = 'active'`,
    [tenantSlug],
  );

  return (rows as Array<{ environment_id: string; env_slug: string; secrets: string | null }>).map((row) => {
    let authHeader: string | null = null;
    if (row.secrets) {
      try {
        const secrets = decryptSecrets(row.secrets) as Record<string, unknown>;
        if (typeof secrets.authHeader === 'string' && secrets.authHeader) authHeader = secrets.authHeader;
      } catch {
        // secret corrompido → environment fica não-autorizável (não derruba o webhook)
      }
    }
    return { environmentId: row.environment_id, envSlug: row.env_slug, authHeader };
  });
}

webhooksRouter.post('/contacts/:tenantSlug', async (req: Request, res: Response): Promise<void> => {
  try {
    const targets = await loadWebhookTargets(req.params.tenantSlug);
    if (targets.length === 0) {
      // 401 idêntico ao de token inválido — 404 aqui permitiria enumerar
      // quais slugs de tenant existem no sistema
      res.status(401).json({ success: false, error: 'Não autorizado', timestamp: ts() });
      return;
    }

    const provided = (req.headers.authorization ?? req.headers['x-webhook-token']) as string | undefined;
    if (!provided) {
      res.status(401).json({ success: false, error: 'Não autorizado', timestamp: ts() });
      return;
    }

    const authorized = targets.filter((t) => t.authHeader && safeEqual(provided, t.authHeader));
    if (authorized.length === 0) {
      res.status(401).json({ success: false, error: 'Não autorizado', timestamp: ts() });
      return;
    }

    // Roteamento: environment explícito, client_type legado, ou fan-out total
    const body = (req.body ?? {}) as Record<string, unknown>;
    const routeKey =
      (typeof body.environment === 'string' && body.environment) ||
      (typeof body.client_type === 'string' && body.client_type !== 'full' && body.client_type) ||
      null;

    let selected = authorized;
    if (routeKey) {
      selected = authorized.filter((t) => t.envSlug === routeKey);
      if (selected.length === 0) {
        res.status(400).json({
          success: false,
          error: `Environment "${routeKey}" não existe, está inativo ou não está autorizado por este token`,
          timestamp: ts(),
        });
        return;
      }
    }

    const parsed = contactPayloadSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        timestamp: ts(),
      });
      return;
    }

    const enqueued: Array<{ environment: string; contactId: number }> = [];
    const isFanOut = selected.length > 1;
    for (const target of selected) {
      const contactId = await enqueueContact(target.environmentId, parsed.data, isFanOut);
      enqueued.push({ environment: target.envSlug, contactId });
    }

    // Processamento imediato em background (guarda de sobreposição interna
    // evita concorrer com o worker agendado; compatível com serverless)
    for (const target of selected) {
      runInBackground(() => runContactsSync(target.environmentId, 'manual'), 'webhook:contacts');
    }

    res.status(202).json({
      success: true,
      message: `Contato enfileirado para ${enqueued.length} environment(s)`,
      enqueued,
      timestamp: ts(),
    });
  } catch (err) {
    console.error('❌ Erro interno [webhook contacts]:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Erro interno do servidor', timestamp: ts() });
  }
});
