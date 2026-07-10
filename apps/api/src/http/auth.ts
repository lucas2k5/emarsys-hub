/**
 * Autenticação:
 * - Hash de senha: crypto.scryptSync nativo — formato "scrypt:<salt_b64>:<hash_b64>"
 * - JWT: jose (ESM-nativo), cookie hub_session HttpOnly SameSite=Lax maxAge 8h
 * - Endpoints: POST /auth/login | POST /auth/logout | GET /auth/me
 * - Middleware requireAuth: protege /api/*
 * - Rate limit no login: 20 tentativas / 15 min por IP
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/pool.js';

// ── Tipo do usuário autenticado injetado no Request ──────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

/**
 * Extensão do Request do Express com o campo `user` injetado pelo requireAuth.
 * Usamos uma interface local em vez de augmentar `express-serve-static-core`
 * para evitar dependência do módulo interno que nem sempre é resolvível em
 * projetos NodeNext.
 */
export interface AuthRequest extends Request {
  user?: AuthUser;
}

// ── Configuração JWT ─────────────────────────────────────────────────────────

const COOKIE_NAME = 'hub_session';
const SESSION_MAX_AGE_S = 8 * 60 * 60; // 8 horas em segundos

/**
 * JWT_SECRET é OBRIGATÓRIA — sem fallback para ENCRYPTION_KEY.
 * Separação de segredos: a chave de criptografia de dados e a chave de JWT
 * devem ser independentes. O servidor não sobe sem JWT_SECRET definida.
 */
function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'JWT_SECRET não definida. Gere com: openssl rand -hex 32 e adicione ao .env',
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Valida que JWT_SECRET está definida. Deve ser chamada pelo index.ts
 * APÓS o dotenv.config() ter sido executado — em ESM, módulos são avaliados
 * antes da execução do entry point, então a validação eager no escopo do módulo
 * roda antes do dotenv carregar as variáveis.
 */
export function validateAuthConfig(): void {
  getJwtSecret(); // lança se JWT_SECRET ausente
}

// ── Utilitários de senha ─────────────────────────────────────────────────────
// Usamos scryptSync (síncrono) para evitar problemas de tipagem com promisify
// nas versões recentes de @types/node. O custo de CPU (~100ms) é aceitável
// em contexto de autenticação HTTP.

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const storedHash = Buffer.from(hashB64, 'base64');
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 });
  if (derived.length !== storedHash.length) return false;
  return timingSafeEqual(derived, storedHash);
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

async function signToken(payload: AuthUser): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(getJwtSecret());
}

async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return {
    sub: payload.sub as string,
    email: payload['email'] as string,
    role: payload['role'] as string,
  };
}

// ── Rate limiter para POST /auth/login ───────────────────────────────────────

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    timestamp: new Date().toISOString(),
  },
});

// ── Middleware requireAuth ───────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = req.cookies as Record<string, string | undefined>;
  const token = cookies[COOKIE_NAME];
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Não autenticado',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  verifyToken(token)
    .then((user) => {
      (req as AuthRequest).user = user;
      next();
    })
    .catch(() => {
      res.clearCookie(COOKIE_NAME);
      res.status(401).json({
        success: false,
        error: 'Sessão inválida ou expirada',
        timestamp: new Date().toISOString(),
      });
    });
}

// ── Router /auth ─────────────────────────────────────────────────────────────

export const authRouter = Router();

// POST /auth/login — com rate limit por IP
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: 'email e password são obrigatórios',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      role: string;
    }>(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );

    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({
        success: false,
        error: 'Credenciais inválidas',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const token = await signToken({ sub: user.id, email: user.email, role: user.role });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_S * 1000,
      secure: process.env.NODE_ENV === 'production',
    });

    res.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ Erro no login:', err);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /auth/logout
authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
});

// GET /auth/me
authRouter.get('/me', requireAuth, (req: Request, res: Response): void => {
  const u = (req as AuthRequest).user!;
  res.json({
    success: true,
    user: { id: u.sub, email: u.email, role: u.role },
    timestamp: new Date().toISOString(),
  });
});
