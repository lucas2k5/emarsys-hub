/**
 * Rotas de environments, connections, field-mappings e flows.
 * Montado em /api/environments no index.ts.
 *
 * NOTA DE SEGURANÇA (pertencimento entre tenants):
 * Todos os lookups são por envId (UUID v4 aleatório gerado pelo Postgres).
 * O sistema atual tem um único papel "admin" com acesso global — não há
 * isolamento por tenant no token. Como o UUID é criptograficamente aleatório
 * e não-sequencial, a enumeração é inviável. Quando multi-role for necessário,
 * adicionar um JOIN com o tenant_id extraído do JWT antes de qualquer mutação.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { encryptSecrets, decryptSecrets } from '../tenancy/crypto.js';

export const environmentsRouter = Router();

// ── Schemas ──────────────────────────────────────────────────────────────────

const CONNECTION_KINDS = [
  'vtex',
  'vtex_io_app',
  'emarsys_oauth2',
  'emarsys_wsse',
  'emarsys_sales_api',
  'sftp_products',
  'contacts_webhook',
] as const;

type ConnectionKind = (typeof CONNECTION_KINDS)[number];

const connectionKindSchema = z.enum(CONNECTION_KINDS);

const upsertConnectionSchema = z.object({
  config: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.unknown()).optional(),
});

const fieldMappingItemSchema = z.object({
  fieldKey: z.string().min(1),
  emarsysFieldId: z.string().min(1),
  isExternalId: z.boolean().default(false),
});

const putFieldMappingsSchema = z.object({
  mappings: z.array(fieldMappingItemSchema),
});

const FLOW_TYPES = ['products', 'orders', 'contacts', 'wishlist'] as const;

const putFlowSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const patchEnvSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function notFound(res: Response, msg = 'Não encontrado') {
  res.status(404).json({ success: false, error: msg, timestamp: ts() });
}

function conflict(res: Response, msg: string) {
  res.status(409).json({ success: false, error: msg, timestamp: ts() });
}

function badRequest(res: Response, msg: string) {
  res.status(400).json({ success: false, error: msg, timestamp: ts() });
}

function internalError(res: Response, err: unknown) {
  // Detalhe técnico apenas no log — nunca exposto ao cliente.
  console.error('❌ Erro interno [environments]:', err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: 'Erro interno do servidor', timestamp: ts() });
}

// ── GET /api/environments/:envId ─────────────────────────────────────────────

environmentsRouter.get('/:envId', async (req: Request, res: Response): Promise<void> => {
  const pool = getPool();
  try {
    const { rows: envRows } = await pool.query(
      `SELECT id, tenant_id AS "tenantId", slug, name, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tenant_environments WHERE id = $1`,
      [req.params.envId],
    );
    if (!envRows[0]) { notFound(res, 'Environment não encontrado'); return; }
    const env = envRows[0] as Record<string, unknown>;

    // Connections — NUNCA retornar secrets descriptografados; apenas flag booleana.
    const { rows: connRows } = await pool.query(
      `SELECT id, kind, config, (secrets IS NOT NULL) AS "hasSecrets",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM environment_connections WHERE environment_id = $1`,
      [req.params.envId],
    );

    // Field mappings
    const { rows: mappingRows } = await pool.query(
      `SELECT id, field_key AS "fieldKey", emarsys_field_id AS "emarsysFieldId",
              is_external_id AS "isExternalId"
       FROM emarsys_field_mappings WHERE environment_id = $1`,
      [req.params.envId],
    );

    // Flows
    const { rows: flowRows } = await pool.query(
      `SELECT id, flow, enabled, cron_expression AS "cronExpression", settings,
              checkpoint, last_run_at AS "lastRunAt", last_status AS "lastStatus"
       FROM environment_flows WHERE environment_id = $1`,
      [req.params.envId],
    );

    res.json({
      success: true,
      environment: {
        ...env,
        connections: connRows,
        fieldMappings: mappingRows,
        flows: flowRows,
      },
      timestamp: ts(),
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── PATCH /api/environments/:envId ──────────────────────────────────────────

environmentsRouter.patch('/:envId', async (req: Request, res: Response): Promise<void> => {
  const parsed = patchEnvSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }
  const fields = parsed.data;
  const pool = getPool();

  try {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (fields.name !== undefined) { sets.push(`name = $${idx++}`); params.push(fields.name); }
    if (fields.status !== undefined) { sets.push(`status = $${idx++}`); params.push(fields.status); }

    if (sets.length === 0) { badRequest(res, 'Nenhum campo para atualizar'); return; }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.envId);

    const { rows } = await pool.query(
      `UPDATE tenant_environments SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, tenant_id AS "tenantId", slug, name, status,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      params,
    );
    if (!rows[0]) { notFound(res, 'Environment não encontrado'); return; }
    res.json({ success: true, environment: rows[0], timestamp: ts() });
  } catch (err) {
    internalError(res, err);
  }
});

// ── DELETE /api/environments/:envId ─────────────────────────────────────────
// Consistência com DELETE de tenant: só deleta se status='inactive'.

environmentsRouter.delete('/:envId', async (req: Request, res: Response): Promise<void> => {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      'SELECT id, status FROM tenant_environments WHERE id = $1',
      [req.params.envId],
    );
    const env = rows[0] as { id: string; status: string } | undefined;
    if (!env) { notFound(res, 'Environment não encontrado'); return; }
    if (env.status !== 'inactive') {
      conflict(res, 'Só é possível deletar environments com status "inactive"');
      return;
    }
    await pool.query('DELETE FROM tenant_environments WHERE id = $1', [env.id]);
    res.status(204).end();
  } catch (err) {
    internalError(res, err);
  }
});

// ── PUT /api/environments/:envId/connections/:kind ───────────────────────────

environmentsRouter.put(
  '/:envId/connections/:kind',
  async (req: Request, res: Response): Promise<void> => {
    const kindParsed = connectionKindSchema.safeParse(req.params.kind);
    if (!kindParsed.success) {
      badRequest(res, `kind inválido. Aceitos: ${CONNECTION_KINDS.join(', ')}`);
      return;
    }
    const kind: ConnectionKind = kindParsed.data;

    const bodyParsed = upsertConnectionSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      badRequest(res, bodyParsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    const pool = getPool();
    try {
      const { rows: envRows } = await pool.query(
        'SELECT id FROM tenant_environments WHERE id = $1',
        [req.params.envId],
      );
      if (!envRows[0]) { notFound(res, 'Environment não encontrado'); return; }

      const { config, secrets: newSecrets } = bodyParsed.data;

      // Preserva secrets existentes se o campo não foi enviado nesta requisição.
      const { rows: existing } = await pool.query(
        'SELECT secrets FROM environment_connections WHERE environment_id = $1 AND kind = $2',
        [req.params.envId, kind],
      );

      let secretsToStore: string | null = (existing[0] as { secrets: string | null } | undefined)?.secrets ?? null;

      if (newSecrets !== undefined) {
        secretsToStore = encryptSecrets(newSecrets);
      }

      const { rows } = await pool.query(
        `INSERT INTO environment_connections (environment_id, kind, config, secrets)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (environment_id, kind) DO UPDATE
           SET config = EXCLUDED.config,
               secrets = EXCLUDED.secrets,
               updated_at = NOW()
         RETURNING id, kind, config, (secrets IS NOT NULL) AS "hasSecrets",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [req.params.envId, kind, JSON.stringify(config), secretsToStore],
      );

      res.json({ success: true, connection: rows[0], timestamp: ts() });
    } catch (err) {
      internalError(res, err);
    }
  },
);

// ── DELETE /api/environments/:envId/connections/:kind ────────────────────────

environmentsRouter.delete(
  '/:envId/connections/:kind',
  async (req: Request, res: Response): Promise<void> => {
    const kindParsed = connectionKindSchema.safeParse(req.params.kind);
    if (!kindParsed.success) {
      badRequest(res, `kind inválido. Aceitos: ${CONNECTION_KINDS.join(', ')}`);
      return;
    }
    const pool = getPool();
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM environment_connections WHERE environment_id = $1 AND kind = $2',
        [req.params.envId, req.params.kind],
      );
      if (!rowCount) { notFound(res, 'Connection não encontrada'); return; }
      res.status(204).end();
    } catch (err) {
      internalError(res, err);
    }
  },
);

// ── PUT /api/environments/:envId/field-mappings ──────────────────────────────

environmentsRouter.put(
  '/:envId/field-mappings',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = putFieldMappingsSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: envRows } = await client.query(
        'SELECT id FROM tenant_environments WHERE id = $1',
        [req.params.envId],
      );
      if (!envRows[0]) {
        await client.query('ROLLBACK');
        notFound(res, 'Environment não encontrado');
        return;
      }

      // Replace completo em transação — garante consistência do conjunto de mapeamentos.
      await client.query(
        'DELETE FROM emarsys_field_mappings WHERE environment_id = $1',
        [req.params.envId],
      );

      const inserted: unknown[] = [];
      for (const m of parsed.data.mappings) {
        const { rows } = await client.query(
          `INSERT INTO emarsys_field_mappings
             (environment_id, field_key, emarsys_field_id, is_external_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, field_key AS "fieldKey", emarsys_field_id AS "emarsysFieldId",
                     is_external_id AS "isExternalId"`,
          [req.params.envId, m.fieldKey, m.emarsysFieldId, m.isExternalId],
        );
        inserted.push(rows[0]);
      }

      await client.query('COMMIT');
      res.json({ success: true, fieldMappings: inserted, timestamp: ts() });
    } catch (err) {
      await client.query('ROLLBACK');
      internalError(res, err);
    } finally {
      client.release();
    }
  },
);

// ── PUT /api/environments/:envId/flows/:flow ─────────────────────────────────

environmentsRouter.put(
  '/:envId/flows/:flow',
  async (req: Request, res: Response): Promise<void> => {
    const flowParsed = z.enum(FLOW_TYPES).safeParse(req.params.flow);
    if (!flowParsed.success) {
      badRequest(res, `flow inválido. Aceitos: ${FLOW_TYPES.join(', ')}`);
      return;
    }

    const bodyParsed = putFlowSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      badRequest(res, bodyParsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    const { enabled, cronExpression, settings } = bodyParsed.data;
    const pool = getPool();

    try {
      const { rows: envRows } = await pool.query(
        'SELECT id FROM tenant_environments WHERE id = $1',
        [req.params.envId],
      );
      if (!envRows[0]) { notFound(res, 'Environment não encontrado'); return; }

      const { rows } = await pool.query(
        `INSERT INTO environment_flows
           (environment_id, flow, enabled, cron_expression, settings)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (environment_id, flow) DO UPDATE
           SET enabled = EXCLUDED.enabled,
               cron_expression = EXCLUDED.cron_expression,
               settings = EXCLUDED.settings,
               updated_at = NOW()
         RETURNING id, flow, enabled, cron_expression AS "cronExpression", settings,
                   checkpoint, last_run_at AS "lastRunAt", last_status AS "lastStatus"`,
        [
          req.params.envId,
          flowParsed.data,
          enabled,
          cronExpression ?? null,
          JSON.stringify(settings ?? {}),
        ],
      );

      res.json({ success: true, flow: rows[0], timestamp: ts() });
    } catch (err) {
      internalError(res, err);
    }
  },
);

// ── Exporta helper de decrypt para uso interno (ex: scheduler) ───────────────

export { decryptSecrets };
