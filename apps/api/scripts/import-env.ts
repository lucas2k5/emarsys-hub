/**
 * Import one-time de um conector legado (.env) para o banco do hub (Fase 5).
 *
 * Cria/atualiza tenant + environment + connections (secrets criptografados) +
 * flows a partir de um arquivo .env dos conectores originais. Uma invocação =
 * UM environment; rode uma vez por ambiente (ex: tenant com 2 ambientes = 2 runs).
 *
 * SEGURANÇA:
 *  - Dry-run por padrão — só grava com --apply.
 *  - Flows são criados DESABILITADOS e com settings.debug=true. Habilitar é
 *    sempre uma ação manual no painel (rodada sombra → cutover).
 *  - Secrets nunca são impressos (só quais chaves foram encontradas).
 *  - O .env de origem é apenas LIDO (repos originais são intocáveis).
 *
 * Uso:
 *   pnpm --filter @emarsys-hub/api exec tsx scripts/import-env.ts \
 *     --env-file <caminho/.env> \
 *     --tenant <slug> --tenant-name "<nome>" \
 *     --environment <slug> --env-name "<nome>" \
 *     [--vtex-suffix _SUFIXO]        # ex: _HOPE → usa VTEX_BASE_URL_HOPE etc.
 *     [--emarsys-prefix PREFIXO]     # ex: EMARSYS_HOPE → *_BASE_URL/_USERNAME/_PASSWORD
 *     [--sftp-user-var VAR] [--sftp-dir-var VAR]  # overrides (ex: RESORT_SFTP_USER)
 *     [--field-mappings "customer_id=3695:ext,cpf=4884,buyer_type=4885"]
 *     [--apply]
 */

import { config as dotenvConfig } from 'dotenv';
import { parse as parseDotenv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') });
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

const { getPool, closePool } = await import('../src/db/pool.js');
const { encryptSecrets } = await import('../src/tenancy/crypto.js');

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const required = ['env-file', 'tenant', 'environment'] as const;
for (const name of required) {
  if (typeof args[name] !== 'string') {
    console.error(`❌ Argumento obrigatório: --${name}`);
    console.error('   Veja o cabeçalho do script para o uso completo.');
    process.exit(1);
  }
}

const envFile = args['env-file'] as string;
const tenantSlug = args.tenant as string;
const tenantName = (args['tenant-name'] as string) || tenantSlug;
const envSlug = args.environment as string;
const envName = (args['env-name'] as string) || envSlug;
const vtexSuffix = (args['vtex-suffix'] as string) || '';
const emarsysPrefix = (args['emarsys-prefix'] as string) || '';
const apply = args.apply === true;

// ── Leitura do .env de origem (read-only) ────────────────────────────────────

const src = parseDotenv(readFileSync(envFile, 'utf8'));

function pick(...names: Array<string | undefined>): string | undefined {
  for (const name of names) {
    if (name && src[name]) return src[name].trim();
  }
  return undefined;
}

const suffixed = (base: string) => (vtexSuffix ? `${base}${vtexSuffix}` : undefined);
const prefixed = (rest: string) => (emarsysPrefix ? `${emarsysPrefix}_${rest}` : undefined);

// ── Montagem das connections ─────────────────────────────────────────────────

type PlannedConnection = {
  kind: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
};

const connections: PlannedConnection[] = [];
const notes: string[] = [];

// vtex
{
  const baseUrl = pick(suffixed('VTEX_BASE_URL'), 'VTEX_BASE_URL');
  const appKey = pick(suffixed('VTEX_APP_KEY'), 'VTEX_APP_KEY');
  const appToken = pick(suffixed('VTEX_APP_TOKEN'), 'VTEX_APP_TOKEN');
  const storeBaseUrl = pick('STORE_BASE_URL');
  if (baseUrl && appKey && appToken) {
    const config: Record<string, string> = { baseUrl, appKey };
    if (storeBaseUrl) config.storeBaseUrl = storeBaseUrl;
    connections.push({ kind: 'vtex', config, secrets: { appToken } });
  } else {
    notes.push('vtex: variáveis incompletas — connection não criada');
  }
}

// vtex_io_app
{
  const url = pick('VTEX_IO_APP_URL');
  if (url) connections.push({ kind: 'vtex_io_app', config: { url }, secrets: {} });
}

// emarsys_oauth2 (OAuth2 dedicado OU credenciais username/password por prefixo)
{
  const clientId = pick('EMARSYS_OAUTH2_CLIENT_ID', prefixed('USERNAME'));
  const clientSecret = pick('EMARSYS_OAUTH2_CLIENT_SECRET', prefixed('PASSWORD'));
  const tokenEndpoint = pick('EMARSYS_OAUTH2_TOKEN_ENDPOINT') || 'https://auth.emarsys.net/oauth2/token';
  const apiBaseUrl = pick(prefixed('BASE_URL')) || 'https://api.emarsys.net';
  if (clientId && clientSecret) {
    connections.push({
      kind: 'emarsys_oauth2',
      config: { clientId, tokenEndpoint, apiBaseUrl },
      secrets: { clientSecret },
    });
  } else {
    notes.push('emarsys_oauth2: credenciais não encontradas — connection não criada');
  }
}

// emarsys_wsse
{
  const username = pick('EMARSYS_USER', 'EMARSYS_USERNAME');
  const secret = pick('EMARSYS_SECRET', 'EMARSYS_PASSWORD');
  if (username && secret) {
    connections.push({ kind: 'emarsys_wsse', config: { username }, secrets: { secret } });
  }
}

// emarsys_sales_api
{
  const apiUrl = pick('EMARSYS_ORDERS_API_URL');
  const token = pick('EMARSYS_SALES_TOKEN');
  if (apiUrl || token) {
    connections.push({
      kind: 'emarsys_sales_api',
      config: apiUrl ? { apiUrl } : {},
      secrets: token ? { token } : {},
    });
  }
}

// sftp_products (com overrides pra ambientes que compartilham host)
{
  const host = pick('SFTP_PRODUCTS_HOST', 'SFTP_HOST');
  const port = pick('SFTP_PRODUCTS_PORT', 'SFTP_PORT') || '22';
  const username = pick(args['sftp-user-var'] as string | undefined, 'SFTP_PRODUCTS_USERNAME', 'SFTP_USERNAME', 'SFTP_USER');
  const password = pick('SFTP_PRODUCTS_PASSWORD', 'SFTP_PASSWORD');
  const remotePath = pick(args['sftp-dir-var'] as string | undefined, 'SFTP_PRODUCTS_REMOTE_PATH', 'SFTP_REMOTE_PATH', 'SFTP_REMOTE_DIR') || '/';
  if (host && username && password) {
    connections.push({
      kind: 'sftp_products',
      config: { host, port, username, remotePath },
      secrets: { password },
    });
  }
}

// contacts_webhook — token NOVO gerado pro hub (o legado não tinha auth própria)
const webhookToken = randomBytes(24).toString('base64url');
connections.push({
  kind: 'contacts_webhook',
  config: { timeout: '30000' },
  secrets: { authHeader: webhookToken },
});

// ── Flows (sempre desabilitados + debug) ─────────────────────────────────────

const flows = [
  { flow: 'products', cron: pick('PRODUCTS_SYNC_CRON') },
  { flow: 'orders', cron: pick('ORDERS_SYNC_CRON') },
  { flow: 'contacts', cron: pick('CONTACTS_RETRY_CRON') || '*/5 * * * *' },
  { flow: 'wishlist', cron: pick('WISHLIST_SYNC_CRON') },
].map((f) => ({ ...f, cron: f.cron?.replace(/['"]/g, '').trim() || null }));

// ── Field mappings (dados via CLI: "chave=id[:ext],..." ) ────────────────────

type Mapping = { fieldKey: string; emarsysFieldId: string; isExternalId: boolean };
const mappings: Mapping[] = [];
if (typeof args['field-mappings'] === 'string') {
  for (const part of (args['field-mappings'] as string).split(',')) {
    const [fieldKey, rest] = part.trim().split('=');
    if (!fieldKey || !rest) continue;
    const [emarsysFieldId, flag] = rest.split(':');
    mappings.push({ fieldKey, emarsysFieldId, isExternalId: flag === 'ext' });
  }
}

// ── Relatório (sem valores de secrets) ───────────────────────────────────────

console.log(`\n📋 Plano de import — ${apply ? 'APLICANDO' : 'DRY-RUN (use --apply para gravar)'}`);
console.log(`   Origem: ${envFile}`);
console.log(`   Tenant: ${tenantSlug} ("${tenantName}") → Environment: ${envSlug} ("${envName}")\n`);
for (const conn of connections) {
  const secretKeys = Object.keys(conn.secrets);
  // appKey é parte da credencial VTEX — mascara no relatório (logs de CI/CD)
  const printable = { ...conn.config };
  if (printable.appKey) printable.appKey = `***${printable.appKey.slice(-4)}`;
  console.log(`   🔌 ${conn.kind}`);
  console.log(`      config : ${JSON.stringify(printable)}`);
  console.log(`      secrets: ${secretKeys.length ? secretKeys.join(', ') + ' (criptografados, não exibidos)' : '(nenhum)'}`);
}
console.log(`\n   🗓️ Flows (todos DESABILITADOS, settings.debug=true):`);
for (const f of flows) console.log(`      ${f.flow}: cron=${f.cron ?? '(sem cron)'}`);
if (mappings.length) {
  console.log(`\n   🏷️ Field mappings:`);
  for (const m of mappings) console.log(`      ${m.fieldKey} → ${m.emarsysFieldId}${m.isExternalId ? ' (external id)' : ''}`);
}
if (notes.length) {
  console.log(`\n   ⚠️ Avisos:`);
  for (const note of notes) console.log(`      ${note}`);
}
console.log(`\n   🔑 Token do webhook de contatos (guarde — não será exibido de novo): ${apply ? webhookToken : '(gerado só no --apply)'}\n`);

if (!apply) {
  process.exit(0);
}

// ── Gravação ─────────────────────────────────────────────────────────────────

const pool = getPool();
try {
  const { rows: tenantRows } = await pool.query(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [tenantSlug, tenantName],
  );
  const tenantId = (tenantRows[0] as { id: string }).id;

  const { rows: envRows } = await pool.query(
    `INSERT INTO tenant_environments (tenant_id, slug, name) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [tenantId, envSlug, envName],
  );
  const environmentId = (envRows[0] as { id: string }).id;

  for (const conn of connections) {
    await pool.query(
      `INSERT INTO environment_connections (environment_id, kind, config, secrets)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (environment_id, kind) DO UPDATE
         SET config = EXCLUDED.config, secrets = EXCLUDED.secrets, updated_at = NOW()`,
      [
        environmentId,
        conn.kind,
        JSON.stringify(conn.config),
        Object.keys(conn.secrets).length ? encryptSecrets(conn.secrets) : null,
      ],
    );
  }

  for (const f of flows) {
    await pool.query(
      `INSERT INTO environment_flows (environment_id, flow, enabled, cron_expression, settings)
       VALUES ($1, $2, FALSE, $3, $4)
       ON CONFLICT (environment_id, flow) DO UPDATE
         SET cron_expression = EXCLUDED.cron_expression, updated_at = NOW()`,
      [environmentId, f.flow, f.cron, JSON.stringify({ debug: true })],
    );
  }

  for (const m of mappings) {
    await pool.query(
      `INSERT INTO emarsys_field_mappings (environment_id, field_key, emarsys_field_id, is_external_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (environment_id, field_key) DO UPDATE
         SET emarsys_field_id = EXCLUDED.emarsys_field_id, is_external_id = EXCLUDED.is_external_id`,
      [environmentId, m.fieldKey, m.emarsysFieldId, m.isExternalId],
    );
  }

  console.log(`✅ Import aplicado: tenant=${tenantSlug} environment=${envSlug} (${connections.length} connections, ${flows.length} flows, ${mappings.length} mappings)`);
  console.log('   Próximo passo: conferir no painel e habilitar os flows em modo debug (rodada sombra).');
} finally {
  await closePool();
}
