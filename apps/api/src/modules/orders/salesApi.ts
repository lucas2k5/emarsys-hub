/**
 * Envio de vendas para a Emarsys Sales Data API (upload binário de CSV).
 *
 * Autenticação: token estático (secrets.token da connection emarsys_sales_api)
 * tem prioridade; senão OAuth2 client_credentials (connection emarsys_oauth2),
 * com cache de token por environment.
 */

import axios from 'axios';
import { getAccessToken, invalidateToken, isOAuth2Configured, type OAuth2Config } from '../emarsys/oauth2.js';
import { logIntegrationEvent } from '../audit.js';
import type { EmarsysSaleRecord } from './service.js';

export const SALES_CSV_HEADERS = [
  'item',
  'price',
  'order',
  'timestamp',
  'customer',
  'quantity',
  's_sales_channel',
  's_store_id',
  's_canal',
  's_loja',
  's_tipo_pagamento',
  's_cupom',
  'f_valor_desconto',
] as const;

export type SalesApiConfig = {
  environmentId: string;
  apiUrl: string;
  staticToken?: string;
  oauth2?: Partial<OAuth2Config>;
  timeoutMs?: number;
  tag: string;
};

function sanitizeField(value: unknown, maxLength: number, fieldName = ''): string {
  if (value === null || value === undefined) return '';

  if (fieldName === 'timestamp') {
    const date = new Date(String(value));
    if (isNaN(date.getTime())) return '';
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  let clean = String(value)
    .replace(/"/g, '')
    .replace(/\r?\n/g, ' ')
    .trim()
    .replace(/,/g, ' ');

  if (maxLength > 0 && clean.length > maxLength) clean = clean.substring(0, maxLength);
  return clean;
}

/**
 * Gera o CSV de vendas (13 colunas). Deduplica por order+item e descarta
 * linhas sem customer — a Emarsys rejeita registros sem identificador.
 */
export function buildSalesCsv(records: EmarsysSaleRecord[]): { csv: string; lineCount: number } {
  // Última ocorrência vence: o mesmo (order, item) pode aparecer com statuses
  // diferentes (ex: invoiced e depois canceled) — o registro mais recente é o
  // que deve chegar à Emarsys.
  const unique = new Map<string, EmarsysSaleRecord>();
  for (const record of records) {
    unique.set(`${record.order}_${record.item}`, record);
  }

  const lines: string[] = [SALES_CSV_HEADERS.join(',')];
  for (const record of unique.values()) {
    if (!record.order || !record.item || !record.customer || !record.timestamp) continue;

    const row = [
      sanitizeField(record.item, 25, 'item'),
      sanitizeField(record.price, 25, 'price'),
      sanitizeField(record.order, 25, 'order'),
      sanitizeField(record.timestamp, 25, 'timestamp'),
      sanitizeField(record.customer, 0, 'customer'),
      sanitizeField(record.quantity, 25, 'quantity'),
      sanitizeField(record.s_sales_channel, 25),
      sanitizeField(record.s_store_id, 25),
      sanitizeField(record.s_canal, 25),
      sanitizeField(record.s_loja, 25),
      sanitizeField(record.s_tipo_pagamento, 25),
      sanitizeField(record.s_cupom, 25),
      sanitizeField(record.f_valor_desconto, 25),
    ];
    if (row[0] && row[2] && row[4]) lines.push(row.join(','));
  }

  return { csv: lines.join('\n') + '\n', lineCount: lines.length - 1 };
}

export type SendResult = {
  success: boolean;
  status?: number;
  attempts: number;
  error?: string;
};

export async function sendSalesCsv(cfg: SalesApiConfig, csvContent: string): Promise<SendResult> {
  if (!cfg.apiUrl) {
    return { success: false, attempts: 0, error: 'Connection "emarsys_sales_api": apiUrl não configurada' };
  }
  const hasOAuth2 = cfg.oauth2 && isOAuth2Configured(cfg.oauth2);
  if (!cfg.staticToken && !hasOAuth2) {
    return {
      success: false,
      attempts: 0,
      error: 'Nenhuma credencial para a Sales API (token estático ou connection emarsys_oauth2)',
    };
  }

  const csvBuffer = Buffer.from(csvContent, 'utf8');
  const maxRetries = 3;
  let lastError: Error | null = null;

  // Auditoria: CSV completo é grande demais pro log — guarda meta + amostra
  const csvLines = csvContent.split('\n').filter((l) => l.trim());
  const auditRequest = {
    lines: csvLines.length - 1,
    bytes: csvBuffer.length,
    sample: csvLines.slice(0, 6),
  };
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token = cfg.staticToken || (await getAccessToken(cfg.environmentId, cfg.oauth2 as OAuth2Config));

      console.log(`📤 [sales-api][${cfg.tag}] Enviando CSV (${(csvBuffer.length / 1024).toFixed(2)} KB, tentativa ${attempt}/${maxRetries})`);

      const response = await axios.post(cfg.apiUrl, csvBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/csv',
          Accept: 'text/plain',
        },
        timeout: cfg.timeoutMs ?? 60_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      console.log(`✅ [sales-api][${cfg.tag}] CSV enviado (status: ${response.status})`);
      await logIntegrationEvent({
        environmentId: cfg.environmentId,
        flow: 'orders',
        event: 'sales_csv_sent',
        subject: `${auditRequest.lines} pedidos`,
        request: auditRequest,
        response: response.data,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
      });
      return { success: true, status: response.status, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      // 401 com OAuth2 → invalida token e tenta de novo
      if (status === 401 && !cfg.staticToken && attempt < maxRetries) {
        console.warn(`⚠️ [sales-api][${cfg.tag}] Token OAuth2 expirado, renovando...`);
        invalidateToken(cfg.environmentId);
        continue;
      }

      const isRetryable =
        !status ||
        status >= 500 ||
        status === 429 ||
        (axios.isAxiosError(error) && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT'));

      if (!isRetryable) {
        await logIntegrationEvent({
          environmentId: cfg.environmentId,
          flow: 'orders',
          level: 'error',
          event: 'sales_csv_failed',
          subject: `${auditRequest.lines} pedidos`,
          request: auditRequest,
          response: { error: lastError.message, data: axios.isAxiosError(error) ? error.response?.data : undefined },
          statusCode: status ?? null,
          durationMs: Date.now() - startedAt,
        });
        return { success: false, status, attempts: attempt, error: lastError.message };
      }

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  await logIntegrationEvent({
    environmentId: cfg.environmentId,
    flow: 'orders',
    level: 'error',
    event: 'sales_csv_failed',
    subject: `${auditRequest.lines} pedidos`,
    request: auditRequest,
    response: { error: `Falha após ${maxRetries} tentativas: ${lastError?.message}` },
    durationMs: Date.now() - startedAt,
  });
  return {
    success: false,
    attempts: maxRetries,
    error: `Falha após ${maxRetries} tentativas: ${lastError?.message}`,
  };
}
