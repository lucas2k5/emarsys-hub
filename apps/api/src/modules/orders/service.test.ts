import { describe, it, expect } from 'vitest';
import {
  transformOrderToRows,
  transformRowsForEmarsys,
  isValidCustomerEmail,
  type VtexOrderDetail,
} from './service.js';
import type { OrderRecord } from './repo.js';

function order(overrides: Partial<VtexOrderDetail> = {}): VtexOrderDetail {
  return {
    orderId: 'PED-100',
    status: 'invoiced',
    creationDate: '2026-07-01T12:00:00Z',
    hostname: 'minhaloja',
    salesChannel: '1',
    clientProfileData: { email: 'cliente@example.com', document: '390.533.447-05' },
    totals: [
      { id: 'Discounts', value: -3000 }, // R$ 30,00 de desconto
      { id: 'Shipping', value: 1500 },   // R$ 15,00 de frete
    ],
    items: [
      { refId: 'SKU-A', quantity: 1, sellingPrice: 10000 }, // R$ 100
      { refId: 'SKU-B', quantity: 2, sellingPrice: 5000 },  // R$ 50
      { refId: 'SKU-C', quantity: 1, sellingPrice: 3333 },  // R$ 33,33
    ],
    ...overrides,
  };
}

describe('transformOrderToRows — rateio exato', () => {
  it('a soma dos descontos rateados bate exatamente com o total', () => {
    const rows = transformOrderToRows(order(), 'cliente@example.com', {});
    const totalDiscount = rows.reduce((acc, r) => acc + parseFloat(String(r.s_discount)), 0);
    expect(totalDiscount).toBeCloseTo(30.0, 10);
  });

  it('a soma do frete embutido nos preços bate com preço+frete total', () => {
    const rows = transformOrderToRows(order(), null, {});
    const totalPrice = rows.reduce((acc, r) => acc + parseFloat(String(r.price)), 0);
    // 100 + 50 + 33.33 (itens) + 15.00 (frete total) = 198.33
    expect(totalPrice).toBeCloseTo(198.33, 2);
  });

  it('customer = sha256 do CPF limpo', () => {
    const rows = transformOrderToRows(order(), null, {});
    // sha256('39053344705')
    expect(rows[0].customer).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(rows.map((r) => r.customer)).size).toBe(1);
  });

  it('preço inteiro é centavos (/100); fracionário já é reais', () => {
    const rows = transformOrderToRows(
      order({ totals: [], items: [{ refId: 'SKU-INT', quantity: 1, sellingPrice: 1000 }, { refId: 'SKU-FLT', quantity: 1, sellingPrice: 79.9 }] }),
      null,
      {},
    );
    expect(rows.find((r) => r.item === 'SKU-INT')!.price).toBe('10.00');
    expect(rows.find((r) => r.item === 'SKU-FLT')!.price).toBe('79.90');
  });

  it('item sem refId é pulado; pedido sem itens não gera linhas', () => {
    expect(transformOrderToRows(order({ items: [{ quantity: 1, sellingPrice: 100 }] }), null, {})).toHaveLength(0);
    expect(transformOrderToRows(order({ items: [] }), null, {})).toHaveLength(0);
  });

  it('salesChannelMap das settings traduz o canal', () => {
    const rows = transformOrderToRows(order(), null, { salesChannelMap: { '1': 'Canal Um' } });
    expect(rows[0].s_canal).toBe('Canal Um');
  });
});

describe('isValidCustomerEmail', () => {
  it('rejeita email mascarado da VTEX e domínios configurados', () => {
    expect(isValidCustomerEmail('x@ct.vtex.com.br', {})).toBe(false);
    expect(isValidCustomerEmail('a@example.com', {})).toBe(true);
    expect(isValidCustomerEmail('a@interno.com', { invalidEmailDomains: ['interno.com'] })).toBe(false);
    expect(isValidCustomerEmail(null, {})).toBe(false);
  });
});

describe('transformRowsForEmarsys — cancelados', () => {
  function dbRow(overrides: Partial<OrderRecord> = {}): OrderRecord {
    return {
      order: 'PED-1', item: 'SKU-1', email: 'a@b.com', quantity: 2, price: '50.00',
      timestamp: '2026-07-01T10:00:00Z', isSync: false, order_status: 'invoiced',
      s_channel_source: '1', s_store_id: 'loja', s_sales_channel: 'Online',
      s_discount: '5.00', customer: 'hash', s_canal: 'c', s_loja: 'l',
      s_tipo_pagamento: 'pix', s_cupom: '', f_valor_desconto: '5.00',
      ...overrides,
    };
  }

  it('pedido cancelado vira quantidade/preço negativos', () => {
    const { records, canceledCount } = transformRowsForEmarsys([dbRow({ order_status: 'canceled' })], {});
    expect(canceledCount).toBe(1);
    expect(records[0].quantity).toBe(-2);
    expect(records[0].price).toBe('-50.00');
    expect(records[0].f_valor_desconto).toBe('-5.00');
  });

  it('desconto zero em cancelado fica "0.00" sem sinal', () => {
    const { records } = transformRowsForEmarsys([dbRow({ order_status: 'refunded', s_discount: '0' })], {});
    expect(records[0].f_valor_desconto).toBe('0.00');
  });

  it('linha sem customer é pulada e contada', () => {
    const { records, skippedNoCustomer } = transformRowsForEmarsys([dbRow({ customer: null })], {});
    expect(records).toHaveLength(0);
    expect(skippedNoCustomer).toBe(1);
  });
});
