/**
 * emarsys-hub API — entry point
 *
 * O .env fica na raiz do monorepo. Quando `pnpm dev:api` roda com cwd em
 * apps/api, dotenv não o encontra automaticamente. Carregamos com fallback
 * explícito (local → raiz do monorepo) ANTES de qualquer outro import que
 * leia process.env — em ESM não é possível garantir a ordem de avaliação de
 * módulos via import estático, por isso a validação de variáveis obrigatórias
 * (ex: JWT_SECRET) é feita na função start() e não no escopo do módulo.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega envs antes de qualquer código que leia process.env
dotenvConfig({ path: resolve(__dirname, '../.env') });
dotenvConfig({ path: resolve(__dirname, '../../../.env') }); // raiz do monorepo

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { runMigrations, closePool } from './db/pool.js';
import { authRouter, requireAuth, validateAuthConfig } from './http/auth.js';
import { tenantsRouter } from './http/tenants.js';
import { environmentsRouter } from './http/environments.js';
import { dataRouter, metricsMiddleware, memorySnapshot } from './http/data.js';
import { webhooksRouter } from './http/webhooks.js';
import { startScheduler, stopScheduler, runDueFlows } from './scheduler/index.js';
import { failOrphanRuns } from './modules/runs.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';
const PAINEL_ORIGIN = process.env.PAINEL_ORIGIN ?? 'http://localhost:3000';

// Na Vercel não há processo contínuo: sem listen() e sem scheduler residente —
// o cron externo bate em /internal/cron/tick e o trabalho em background usa
// waitUntil (src/lib/background.ts).
const IS_SERVERLESS = !!process.env.VERCEL;

// Init único por processo (cold start em serverless; boot em servidor):
// valida config, roda migrations e libera runs órfãos antes do 1º request.
let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      validateAuthConfig();
      await runMigrations();
      const orphans = await failOrphanRuns();
      if (orphans > 0) console.log(`🧹 ${orphans} sync run(s) órfão(s) marcados como failed`);
    })();
  }
  return initPromise;
}

// ── Middlewares globais ──────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: PAINEL_ORIGIN,
    credentials: true,
  }),
);
app.use(cookieParser());
// Payloads legítimos são pequenos (formulários e webhooks de contato)
app.use(express.json({ limit: '256kb' }));
app.use(metricsMiddleware);

// Garante init (migrations etc.) antes de qualquer rota — essencial no cold
// start serverless; em servidor contínuo resolve instantâneo após o boot.
app.use((_req, res, next) => {
  ensureInit()
    .then(() => next())
    .catch((err) => {
      console.error('❌ Falha na inicialização:', err instanceof Error ? err.message : err);
      res.status(503).json({ success: false, error: 'Serviço inicializando ou mal configurado', timestamp: new Date().toISOString() });
    });
});

// ── Rotas públicas ───────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'emarsys-hub-api',
    uptime: Math.round(process.uptime()),
    memory: memorySnapshot(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/auth', authRouter);

// Webhooks públicos — auth própria por token (connection contacts_webhook),
// com rate limit por IP (endpoint exposto à internet)
const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
app.use('/webhooks', webhookLimiter, webhooksRouter);

// Tick do scheduler para modo serverless (Vercel Cron ou pinger externo).
// Auth: Authorization: Bearer ${CRON_SECRET}.
app.all('/internal/cron/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, error: 'Não autorizado', timestamp: new Date().toISOString() });
    return;
  }
  try {
    const executed = await runDueFlows();
    res.json({ success: true, executed, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('❌ [tick] Erro:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Erro interno do servidor', timestamp: new Date().toISOString() });
  }
});

// ── Rotas protegidas (/api/*) ────────────────────────────────────────────────

app.use('/api', requireAuth);
app.use('/api/tenants', tenantsRouter);

// Endpoints de dados do dashboard (Fase 2) — inclui POST /environments/:envId/flows/:flow/run,
// montado ANTES do environmentsRouter para a rota específica ter precedência.
app.use('/api', dataRouter);

// /api/environments/:envId e sub-rotas (connections, flows, field-mappings)
app.use('/api/environments', environmentsRouter);

// ── Error handler global ─────────────────────────────────────────────────────

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('❌ Erro não tratado:', err instanceof Error ? err.message : err);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
    });
  },
);

// ── Boot ─────────────────────────────────────────────────────────────────────

async function start() {
  try {
    console.log('🔄 Inicializando (migrations etc.)...');
    await ensureInit();
    console.log('✅ Init concluído');

    await startScheduler();

    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 emarsys-hub api rodando em http://${HOST}:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n🕐 ${signal} recebido — encerrando...`);
      stopScheduler();
      server.close(async () => {
        await closePool();
        console.log('✅ Servidor encerrado');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('❌ Falha ao inicializar a API:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (!IS_SERVERLESS) {
  start();
}

// Entry serverless (Vercel) — o wrapper em api/index.js importa este app
export default app;
