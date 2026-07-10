import { describe, it, expect } from 'vitest';
import { buildSalesCsv, SALES_CSV_HEADERS } from './salesApi.js';
import type { EmarsysSaleRecord } from './service.js';

function record(overrides: Partial<EmarsysSaleRecord> = {}): EmarsysSaleRecord {
  return {
    order: 'PED-1',
    item: 'SKU-1',
    customer: 'hash-cliente',
    quantity: 1,
    timestamp: '2026-07-01T10:00:00Z',
    price: '99.90',
    s_sales_channel: 'Online',
    s_store_id: 'loja',
    s_canal: 'Conta Principal',
    s_loja: 'loja',
    s_tipo_pagamento: 'pix',
    s_cupom: '',
    f_valor_desconto: '0.00',
    ...overrides,
  };
}

describe('buildSalesCsv', () => {
  it('gera header com as 13 colunas na ordem da Sales API', () => {
    const { csv } = buildSalesCsv([record()]);
    expect(csv.split('\n')[0]).toBe(SALES_CSV_HEADERS.join(','));
    expect(SALES_CSV_HEADERS).toHaveLength(13);
  });

  it('deduplica por order+item mantendo a ocorrência mais RECENTE', () => {
    const { csv, lineCount } = buildSalesCsv([
      record({ price: '10.00' }),
      record({ price: '20.00' }), // mesma chave, mais recente — deve vencer
    ]);
    expect(lineCount).toBe(1);
    expect(csv).toContain('20.00');
    expect(csv).not.toContain('10.00');
  });

  it('descarta registro sem customer (Emarsys rejeita sem identificador)', () => {
    const { lineCount } = buildSalesCsv([record({ customer: null })]);
    expect(lineCount).toBe(0);
  });

  it('sanitiza vírgulas e normaliza timestamp', () => {
    const { csv } = buildSalesCsv([
      record({ s_cupom: 'CUPOM,COM,VIRGULA', timestamp: '2026-07-01T10:00:00.123Z' }),
    ]);
    const line = csv.split('\n')[1];
    expect(line).toContain('CUPOM COM VIRGULA');
    expect(line).toContain('2026-07-01T10:00:00Z'); // sem milissegundos
    expect(line.split(',')).toHaveLength(13); // vírgulas do cupom não quebram colunas
  });
});
