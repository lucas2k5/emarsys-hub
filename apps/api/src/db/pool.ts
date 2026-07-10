import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    const connStr = process.env.DATABASE_URL;
    if (!connStr) throw new Error('DATABASE_URL não definida');
    // Supabase exige TLS; a cadeia é assinada por CA própria → sem verificação
    // estrita (tráfego segue criptografado). Em serverless o pool precisa ser
    // pequeno — cada instância da função abre o seu.
    const isSupabase = connStr.includes('.supabase.co') || connStr.includes('.pooler.supabase.com');
    _pool = new Pool({
      connectionString: connStr,
      max: Number(process.env.PG_POOL_MAX ?? (process.env.VERCEL ? 2 : 10)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    });
  }
  return _pool;
}

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Garante tabela de controle (idempotente)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = resolve(__dirname, 'migrations');
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const migrationName = file.replace('.sql', '');
    const sql = await readFile(resolve(migrationsDir, file), 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Tenta registrar a migration atomicamente.
      // INSERT ... ON CONFLICT DO NOTHING: se outra instância já inseriu a linha
      // (race condition no boot), rowCount = 0 e pulamos a execução.
      // Assim o check-then-act vira uma única operação dentro da transação.
      const { rowCount } = await client.query(
        `INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [migrationName],
      );

      if (rowCount === 0) {
        // Já executada por esta ou outra instância — rollback e pula.
        await client.query('ROLLBACK');
        continue;
      }

      console.log(`🔄 Executando migration: ${file}`);
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`✅ Migration aplicada: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
