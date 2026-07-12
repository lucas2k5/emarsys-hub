/**
 * Backoffice de usuários do painel (admin-only).
 *
 * Roles:
 *  - admin : acesso total (CRUD de tudo, inclusive usuários)
 *  - viewer: somente leitura — o middleware requireWriteAccess (index.ts)
 *            bloqueia qualquer método não-GET em /api/* para viewers.
 *
 * Guardas anti-lockout: não é possível remover/rebaixar o ÚLTIMO admin,
 * nem deletar a própria conta.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { hashPassword, type AuthRequest } from './auth.js';

export const usersRouter = Router();

const ROLES = ['admin', 'viewer'] as const;

const createUserSchema = z.object({
  email: z.string().email('email inválido').max(200),
  password: z.string().min(8, 'senha deve ter no mínimo 8 caracteres').max(200),
  role: z.enum(ROLES).default('viewer'),
});

const patchUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    password: z.string().min(8, 'senha deve ter no mínimo 8 caracteres').max(200).optional(),
  })
  .refine((d) => d.role !== undefined || d.password !== undefined, {
    message: 'Nenhum campo para atualizar',
  });

function ts() {
  return new Date().toISOString();
}

function forbidden(res: Response, msg = 'Acesso restrito a administradores') {
  res.status(403).json({ success: false, error: msg, timestamp: ts() });
}

function badRequest(res: Response, msg: string) {
  res.status(400).json({ success: false, error: msg, timestamp: ts() });
}

function internalError(res: Response, err: unknown) {
  console.error('❌ Erro interno [users]:', err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: 'Erro interno do servidor', timestamp: ts() });
}

/** Middleware: somente admins passam. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthRequest).user;
  if (user?.role !== 'admin') {
    forbidden(res);
    return;
  }
  next();
}

usersRouter.use(requireAdmin);

// ── GET /api/users ───────────────────────────────────────────────────────────

usersRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, email, role, created_at AS "createdAt" FROM users ORDER BY created_at ASC`,
    );
    res.json({ success: true, users: rows, timestamp: ts() });
  } catch (err) {
    internalError(res, err);
  }
});

// ── POST /api/users ──────────────────────────────────────────────────────────

usersRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }
  const { email, password, role } = parsed.data;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at AS "createdAt"`,
      [email.toLowerCase().trim(), hashPassword(password), role],
    );
    res.status(201).json({ success: true, user: rows[0], timestamp: ts() });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ success: false, error: `Já existe um usuário com o email "${email}"`, timestamp: ts() });
      return;
    }
    internalError(res, err);
  }
});

// ── PATCH /api/users/:id ─────────────────────────────────────────────────────

usersRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }
  const { role, password } = parsed.data;
  const targetId = req.params.id;

  try {
    const pool = getPool();

    // Anti-lockout: rebaixar o último admin deixaria o sistema sem administração
    if (role === 'viewer') {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS admins FROM users WHERE role = 'admin' AND id <> $1`,
        [targetId],
      );
      if ((rows[0] as { admins: number }).admins === 0) {
        res.status(409).json({ success: false, error: 'Não é possível rebaixar o último administrador', timestamp: ts() });
        return;
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (role !== undefined) { sets.push(`role = $${idx++}`); params.push(role); }
    if (password !== undefined) { sets.push(`password_hash = $${idx++}`); params.push(hashPassword(password)); }
    params.push(targetId);

    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, email, role, created_at AS "createdAt"`,
      params,
    );
    if (!rows[0]) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado', timestamp: ts() });
      return;
    }
    res.json({ success: true, user: rows[0], timestamp: ts() });
  } catch (err) {
    internalError(res, err);
  }
});

// ── DELETE /api/users/:id ────────────────────────────────────────────────────

usersRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const me = (req as AuthRequest).user!;

  if (targetId === me.sub) {
    res.status(409).json({ success: false, error: 'Não é possível excluir a própria conta', timestamp: ts() });
    return;
  }

  try {
    const pool = getPool();

    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [targetId]);
    const target = rows[0] as { role: string } | undefined;
    if (!target) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado', timestamp: ts() });
      return;
    }

    // Anti-lockout: nunca deletar o último admin
    if (target.role === 'admin') {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS admins FROM users WHERE role = 'admin' AND id <> $1`,
        [targetId],
      );
      if ((countRows[0] as { admins: number }).admins === 0) {
        res.status(409).json({ success: false, error: 'Não é possível excluir o último administrador', timestamp: ts() });
        return;
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    res.status(204).end();
  } catch (err) {
    internalError(res, err);
  }
});
