import { describe, it, expect, vi } from 'vitest';
import { extractSkus, scrollWishlists, fetchRefId, type WishlistDoc } from './service.js';
import type { AxiosInstance } from 'axios';

describe('extractSkus', () => {
  it('extrai e deduplica SKUs do wrapper', () => {
    const doc: WishlistDoc = {
      ListItemsWrapper: [{ ListItems: [{ Sku: 101 }, { Sku: '101' }, { Sku: ' 202 ' }, { Sku: null }] }],
    };
    expect([...extractSkus(doc)]).toEqual(['101', '202']);
  });

  it('doc sem wrapper/itens → vazio', () => {
    expect(extractSkus({}).size).toBe(0);
    expect(extractSkus({ ListItemsWrapper: [] }).size).toBe(0);
    expect(extractSkus({ ListItemsWrapper: [{}] }).size).toBe(0);
  });
});

describe('scrollWishlists — filtro incremental (correção do bug do original)', () => {
  it('envia o checkpoint no _where e captura o token do header', async () => {
    const get = vi.fn(async () => ({
      data: [{ id: 'w1', email: 'a@b.com', updatedIn: '2026-07-01T00:00:00Z' }],
      headers: { 'x-vtex-md-token': 'tok-continua' },
    }));
    const client = { get } as unknown as AxiosInstance;

    const page = await scrollWishlists(client, 'wishlist', '2026-06-01T00:00:00Z', 500, null);

    const [, options] = get.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(options.params._where).toBe('email<>"" AND updatedIn>"2026-06-01T00:00:00Z"');
    expect(options.params._sort).toBe('updatedIn ASC');
    expect(options.params._token).toBeUndefined();
    expect(page.mdToken).toBe('tok-continua');
    expect(page.docs).toHaveLength(1);
  });

  it('repassa o token de continuação nas páginas seguintes', async () => {
    const get = vi.fn(async () => ({ data: [], headers: {} }));
    const client = { get } as unknown as AxiosInstance;
    await scrollWishlists(client, 'wishlist', '2026-06-01T00:00:00Z', 500, 'tok-abc');
    const [, options] = get.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(options.params._token).toBe('tok-abc');
  });
});

describe('fetchRefId', () => {
  it('retorna o RefId do catálogo', async () => {
    const client = { get: vi.fn(async () => ({ data: { RefId: 'REF-9' } })) } as unknown as AxiosInstance;
    expect(await fetchRefId(client, '9', 't')).toBe('REF-9');
  });

  it('fallback pro próprio skuId em erro ou sem RefId', async () => {
    const boom = { get: vi.fn(async () => { throw new Error('500'); }) } as unknown as AxiosInstance;
    expect(await fetchRefId(boom, '9', 't')).toBe('9');
    const empty = { get: vi.fn(async () => ({ data: {} })) } as unknown as AxiosInstance;
    expect(await fetchRefId(empty, '9', 't')).toBe('9');
  });
});
