/**
 * Orquestração do sync de produtos de um environment:
 * VTEX → snapshot na tabela products → CSV 13 colunas → SFTP Emarsys.
 *
 * Modo debug (flow settings.debug = true): executa busca e persistência,
 * mas NÃO envia ao SFTP — para validar configuração sem tocar sistemas externos.
 */

import { getPool } from '../../db/pool.js';
import { loadEnvironmentContext, markFlowRun, type EnvironmentContext } from '../../tenancy/context.js';
import { startRun, updateRunProgress, completeRun, failRun, hasRunningRun, type RunTrigger } from '../runs.js';
import { logIntegrationEvent } from '../audit.js';
import { fetchAllProductRows, type ProductRow, type VtexProductsConfig } from './service.js';
import { generateProductsCsv } from './csv.js';
import { uploadBufferToSftp } from './sftp.js';

function requireVtexConfig(ctx: EnvironmentContext): VtexProductsConfig {
  const vtex = ctx.connections.vtex;
  if (!vtex) throw new Error('Connection "vtex" não configurada para este environment');
  const baseUrl = vtex.config.baseUrl;
  const appKey = vtex.config.appKey || vtex.secrets.appKey;
  const appToken = vtex.secrets.appToken || vtex.config.appToken;
  if (!baseUrl) throw new Error('Connection "vtex": baseUrl não configurada');
  if (!appKey || !appToken) throw new Error('Connection "vtex": appKey/appToken não configurados');
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    appKey,
    appToken,
    storeBaseUrl: (vtex.config.storeBaseUrl || baseUrl).replace(/\/+$/, ''),
    tag: `${ctx.tenantSlug}/${ctx.envSlug}`,
  };
}

async function replaceProductsSnapshot(environmentId: string, rows: ProductRow[]): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM products WHERE environment_id = $1', [environmentId]);

    // Multi-row INSERT em lotes — bem mais rápido que 1 INSERT por SKU.
    const BATCH = 500;
    const rowValues = (row: ProductRow): unknown[] => [
      environmentId,
      row.item,
      row.title || null,
      row.link || null,
      row.image || null,
      row.category || null,
      row.available ?? null,
      row.description || null,
      row.price === '' ? null : row.price,
      row.msrp === '' ? null : row.msrp,
      row.group_id || null,
      Number.isFinite(Number(row.c_stock)) ? Number(row.c_stock) : 0,
      row.c_sku_id || null,
      row.c_product_id || null,
    ];

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples: string[] = [];
      batch.forEach((row, j) => {
        const vals = rowValues(row);
        const base = j * vals.length;
        tuples.push(`(${vals.map((_, k) => `$${base + k + 1}`).join(',')})`);
        values.push(...vals);
      });
      await client.query(
        `INSERT INTO products (
           environment_id, item, title, link, image, category, available,
           description, price, msrp, group_id, c_stock, c_sku_id, c_product_id
         ) VALUES ${tuples.join(',')}
         ON CONFLICT (environment_id, item) DO UPDATE SET
           title = EXCLUDED.title, link = EXCLUDED.link, image = EXCLUDED.image,
           category = EXCLUDED.category, available = EXCLUDED.available,
           description = EXCLUDED.description, price = EXCLUDED.price,
           msrp = EXCLUDED.msrp, group_id = EXCLUDED.group_id,
           c_stock = EXCLUDED.c_stock, c_sku_id = EXCLUDED.c_sku_id,
           c_product_id = EXCLUDED.c_product_id, updated_at = NOW()`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type ProductsSyncResult = {
  success: boolean;
  runId: string;
  totalProducts?: number;
  fileName?: string;
  uploaded?: boolean;
  debug?: boolean;
  error?: string;
};

export async function runProductsSync(
  environmentId: string,
  trigger: RunTrigger,
): Promise<ProductsSyncResult> {
  const ctx = await loadEnvironmentContext(environmentId);
  if (!ctx) throw new Error(`Environment ${environmentId} não encontrado`);

  if (await hasRunningRun(environmentId, 'products')) {
    throw new Error('Já existe um sync de produtos em andamento para este environment');
  }

  const runId = await startRun(environmentId, 'products', trigger);
  const flow = ctx.flows.products;
  const settings = flow?.settings ?? {};
  const debug = settings.debug === true;
  const fileName = typeof settings.fileName === 'string' && settings.fileName ? settings.fileName : 'products.csv';
  const tag = `${ctx.tenantSlug}/${ctx.envSlug}`;

  try {
    const vtexCfg = requireVtexConfig(ctx);
    await updateRunProgress(runId, 5);

    console.log(`🚀 [products][${tag}] Iniciando sync (trigger: ${trigger}${debug ? ', DEBUG' : ''})`);
    const rows = await fetchAllProductRows(vtexCfg);
    await updateRunProgress(runId, 70);

    // Falha total da VTEX resulta em 0 SKUs (o retry interno devolve null em vez
    // de lançar). Abortar aqui evita zerar o snapshot e enviar catálogo vazio.
    if (rows.length === 0) {
      throw new Error('Nenhum SKU retornado pela VTEX — verifique credenciais/URL da connection "vtex"');
    }

    await replaceProductsSnapshot(environmentId, rows);
    await updateRunProgress(runId, 85);

    const csv = generateProductsCsv(rows);

    let uploaded = false;
    if (debug) {
      console.log(`🧪 [products][${tag}] DEBUG — upload SFTP pulado (${rows.length} SKUs, ${csv.length} bytes)`);
    } else {
      const sftpConn = ctx.connections.sftp_products;
      if (!sftpConn) throw new Error('Connection "sftp_products" não configurada para este environment');
      const uploadStartedAt = Date.now();
      try {
        const remoteFile = await uploadBufferToSftp(
          {
            host: sftpConn.config.host,
            port: Number(sftpConn.config.port || 22),
            username: sftpConn.config.username,
            password: sftpConn.secrets.password,
            remotePath: sftpConn.config.remotePath || '/',
          },
          csv,
          fileName,
        );
        await logIntegrationEvent({
          environmentId,
          flow: 'products',
          event: 'sftp_upload',
          subject: fileName,
          request: { fileName, bytes: csv.length, totalProducts: rows.length, remoteFile },
          durationMs: Date.now() - uploadStartedAt,
          runId,
        });
      } catch (err) {
        await logIntegrationEvent({
          environmentId,
          flow: 'products',
          level: 'error',
          event: 'sftp_upload_failed',
          subject: fileName,
          request: { fileName, bytes: csv.length, totalProducts: rows.length },
          response: { error: err instanceof Error ? err.message : String(err) },
          durationMs: Date.now() - uploadStartedAt,
          runId,
        });
        throw err;
      }
      uploaded = true;
    }

    const stats = {
      totalProducts: rows.length,
      fileName,
      fileSize: csv.length,
      uploaded,
      debug,
    };
    await completeRun(runId, stats);
    await markFlowRun(environmentId, 'products', 'success');
    console.log(`✅ [products][${tag}] Sync concluído: ${rows.length} SKUs`);
    return { success: true, runId, totalProducts: rows.length, fileName, uploaded, debug };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(runId, message);
    await markFlowRun(environmentId, 'products', 'error');
    console.error(`❌ [products][${tag}] Sync falhou: ${message}`);
    return { success: false, runId, error: message };
  }
}
