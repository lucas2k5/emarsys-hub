import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';

export const tenantsRouter = Router();

// ── Schemas de validação ─────────────────────────────────────────────────────

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug deve ser kebab-case (ex: minha-loja)');

const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
});

const patchTenantSchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createEnvSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
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
  console.error('❌ Erro interno [tenants]:', err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: 'Erro interno do servidor', timestamp: ts() });
}

// ── GET /api/tenants ─────────────────────────────────────────────────────────

tenantsRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, slug, name, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM tenants ORDER BY created_at DESC',
    );
    res.json({ success: true, tenants: rows, timestamp: ts() });
  } catch (err) {
    internalError(res, err);
  }
});

// ── POST /api/tenants ────────────────────────────────────────────────────────

tenantsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }
  const { slug, name } = parsed.data;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2)
       RETURNING id, slug, name, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [slug, name],
    );
    res.status(201).json({ success: true, tenant: rows[0], timestamp: ts() });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      conflict(res, `Já existe um tenant com o slug "${slug}"`);
      return;
    }
    internalError(res, err);
  }
});

// ── GET /api/tenants/:slug ───────────────────────────────────────────────────

tenantsRouter.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  const pool = getPool();
  try {
    const { rows: tRows } = await pool.query(
      'SELECT id, slug, name, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM tenants WHERE slug = $1',
      [req.params.slug],
    );
    if (!tRows[0]) { notFound(res, 'Tenant não encontrado'); return; }

    const tenant = tRows[0] as { id: string; slug: string; name: string; status: string; createdAt: string; updatedAt: string };

    const { rows: envRows } = await pool.query(
      `SELECT id, slug, name, status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tenant_environments WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenant.id],
    );

    res.json({ success: true, tenant: { ...tenant, environments: envRows }, timestamp: ts() });
  } catch (err) {
    internalError(res, err);
  }
});

// ── PATCH /api/tenants/:slug ─────────────────────────────────────────────────

tenantsRouter.patch('/:slug', async (req: Request, res: Response): Promise<void> => {
  const parsed = patchTenantSchema.safeParse(req.body);
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

    // Renomear slug: URLs derivadas mudam junto (painel /clientes/<slug> e o
    // webhook público /webhooks/contacts/<slug> — reconfigurar quem chama!)
    if (fields.slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(fields.slug); }
    if (fields.name !== undefined) { sets.push(`name = $${idx++}`); params.push(fields.name); }
    if (fields.status !== undefined) { sets.push(`status = $${idx++}`); params.push(fields.status); }

    if (sets.length === 0) { badRequest(res, 'Nenhum campo para atualizar'); return; }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.slug);

    const { rows } = await pool.query(
      `UPDATE tenants SET ${sets.join(', ')} WHERE slug = $${idx}
       RETURNING id, slug, name, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      params,
    );
    if (!rows[0]) { notFound(res, 'Tenant não encontrado'); return; }
    res.json({ success: true, tenant: rows[0], timestamp: ts() });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      conflict(res, `Já existe um tenant com o slug "${fields.slug}"`);
      return;
    }
    internalError(res, err);
  }
});

// ── DELETE /api/tenants/:slug ────────────────────────────────────────────────

tenantsRouter.delete('/:slug', async (req: Request, res: Response): Promise<void> => {
  const pool = getPool();
  try {
    const { rows } = await pool.query('SELECT id, status FROM tenants WHERE slug = $1', [req.params.slug]);
    const tenant = rows[0] as { id: string; status: string } | undefined;
    if (!tenant) { notFound(res, 'Tenant não encontrado'); return; }
    if (tenant.status !== 'inactive') {
      conflict(res, 'Só é possível deletar tenants com status "inactive"');
      return;
    }
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenant.id]);
    res.status(204).end();
  } catch (err) {
    internalError(res, err);
  }
});

// ── POST /api/tenants/:slug/environments ─────────────────────────────────────

tenantsRouter.post('/:slug/environments', async (req: Request, res: Response): Promise<void> => {
  const parsed = createEnvSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }
  const { slug, name } = parsed.data;
  const pool = getPool();

  try {
    const { rows: tRows } = await pool.query('SELECT id FROM tenants WHERE slug = $1', [req.params.slug]);
    if (!tRows[0]) { notFound(res, 'Tenant não encontrado'); return; }
    const tenantId = (tRows[0] as { id: string }).id;

    const { rows } = await pool.query(
      `INSERT INTO tenant_environments (tenant_id, slug, name) VALUES ($1, $2, $3)
       RETURNING id, tenant_id AS "tenantId", slug, name, status,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, slug, name],
    );
    res.status(201).json({ success: true, environment: rows[0], timestamp: ts() });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      conflict(res, `Já existe um environment com o slug "${slug}" neste tenant`);
      return;
    }
    internalError(res, err);
  }
});

// NOTA: PATCH /api/environments/:envId e DELETE /api/environments/:envId
// estão em src/http/environments.ts montado em /api/environments.
// Foram removidos daqui porque o Express casaria /:slug com slug="environments",
// tornando as rotas inalcançáveis e sem validação de pertencimento ao tenant.
