/**
 * Seed do primeiro usuário admin.
 * Uso:
 *   ADMIN_EMAIL=admin@exemplo.com ADMIN_PASSWORD=SenhaSegura123 \
 *     pnpm --filter @emarsys-hub/api seed:admin
 *
 * Idempotente: faz upsert por email (atualiza password_hash se já existir).
 *
 * SEGURANÇA: senha apenas via variável de ambiente — argumentos posicionais
 * ficam visíveis em `ps aux` e no histórico do shell.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tenta .env local (apps/api/.env) e depois raiz do monorepo (../../.env)
dotenvConfig({ path: resolve(__dirname, '../.env') });
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

import { hashPassword } from '../src/http/auth.js';
import { getPool, runMigrations, closePool } from '../src/db/pool.js';

async function main() {
  // email pode vir de argv[2] (conveniente para CI sem envs extras)
  // senha SOMENTE por env var — nunca argv
  const email = process.env.ADMIN_EMAIL ?? process.argv[2];
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('❌ ADMIN_EMAIL e ADMIN_PASSWORD devem ser definidos como variáveis de ambiente.');
    console.error('   Uso: ADMIN_EMAIL=admin@hub.dev ADMIN_PASSWORD=<senha> pnpm --filter @emarsys-hub/api seed:admin');
    process.exit(1);
  }

  console.log('🔄 Inicializando banco...');
  await runMigrations();

  const passwordHash = hashPassword(password);
  const pool = getPool();

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin'
     RETURNING id, email, role`,
    [email.toLowerCase().trim(), passwordHash],
  );

  console.log(`✅ Admin criado/atualizado: ${rows[0].email} (id: ${rows[0].id})`);
  await closePool();
}

main().catch((err) => {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
});
