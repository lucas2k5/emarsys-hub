/**
 * Geração do CSV de catálogo (13 colunas, formato SAP Emarsys Product Import).
 * Gera em memória (Buffer) — sem arquivos temporários no disco.
 */

import type { ProductRow } from './service.js';

export const PRODUCT_CSV_HEADERS = [
  'item',
  'title',
  'link',
  'image',
  'category',
  'available',
  'description',
  'price',
  'msrp',
  'group_id',
  'c_stock',
  'c_sku_id',
  'c_product_id',
] as const;

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function generateProductsCsv(rows: ProductRow[]): Buffer {
  const lines = [PRODUCT_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(PRODUCT_CSV_HEADERS.map((col) => escapeField(row[col])).join(','));
  }
  const bom = '\uFEFF';
  return Buffer.from(bom + lines.join('\n') + '\n', 'utf8');
}
