/**
 * Acesso à tabela orders — todas as operações filtradas por environment_id.
 */

import { getPool } from '../../db/pool.js';

export type OrderRecord = {
  order: string;
  item: string;
  email: string | null;
  quantity: number | string | null;
  price: number | string | null;
  timestamp: string | null;
  isSync: boolean;
  order_status: string | null;
  s_channel_source: string | null;
  s_store_id: string | null;
  s_sales_channel: string | null;
  s_discount: string | null;
  customer: string | null;
  s_canal: string | null;
  s_loja: string | null;
  s_tipo_pagamento: string | null;
  s_cupom: string | null;
  f_valor_desconto: string | null;
};

const ORDER_COLUMNS = [
  'environment_id',
  '"order"',
  'item',
  'email',
  'quantity',
  'price',
  'timestamp',
  '"isSync"',
  'order_status',
  's_channel_source',
  's_store_id',
  's_sales_channel',
  's_discount',
  'customer',
  's_canal',
  's_loja',
  's_tipo_pagamento',
  's_cupom',
  'f_valor_desconto',
] as const;

const UPSERT_CONFLICT_SQL = `
  ON CONFLICT (environment_id, "order", item, COALESCE(order_status, '')) DO UPDATE SET
    email            = EXCLUDED.email,
    quantity         = EXCLUDED.quantity,
    price            = EXCLUDED.price,
    timestamp        = EXCLUDED.timestamp,
    "isSync"         = CASE WHEN orders."isSync" = TRUE THEN TRUE ELSE EXCLUDED."isSync" END,
    order_status     = EXCLUDED.order_status,
    s_channel_source = EXCLUDED.s_channel_source,
    s_store_id       = EXCLUDED.s_store_id,
    s_sales_channel  = EXCLUDED.s_sales_channel,
    s_discount       = EXCLUDED.s_discount,
    customer         = EXCLUDED.customer,
    s_canal          = EXCLUDED.s_canal,
    s_loja           = EXCLUDED.s_loja,
    s_tipo_pagamento = EXCLUDED.s_tipo_pagamento,
    s_cupom          = EXCLUDED.s_cupom,
    f_valor_desconto = EXCLUDED.f_valor_desconto,
    updated_at       = NOW()
  RETURNING id, (xmax = 0) AS inserted
`;

function orderValues(environmentId: string, o: OrderRecord): unknown[] {
  return [
    environmentId,
    o.order,
    o.item,
    o.email ?? null,
    o.quantity ?? null,
    o.price ?? null,
    o.timestamp ?? null,
    o.isSync === true,
    o.order_status ?? null,
    o.s_channel_source ?? null,
    o.s_store_id ?? null,
    o.s_sales_channel ?? null,
    o.s_discount ?? null,
    o.customer ?? null,
    o.s_canal ?? null,
    o.s_loja ?? null,
    o.s_tipo_pagamento ?? null,
    o.s_cupom ?? null,
    o.f_valor_desconto ?? null,
  ];
}

export async function insertOrdersBatch(
  environmentId: string,
  orders: OrderRecord[],
): Promise<{ inserted: number; updated: number }> {
  // Dedupe pela chave do UNIQUE index (última ocorrência vence) — linhas
  // duplicadas no MESMO INSERT multi-row fariam o Postgres abortar com
  // "cannot affect row a second time".
  const byKey = new Map<string, OrderRecord>();
  for (const o of orders) {
    if (!o.order || !o.item) continue;
    byKey.set([o.order, o.item, o.order_status ?? ''].join('|'), o);
  }
  const deduped = Array.from(byKey.values());
  if (deduped.length === 0) return { inserted: 0, updated: 0 };

  const pool = getPool();
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  const COLS = ORDER_COLUMNS.length;
  const BATCH = 200; // 200 × 19 colunas = 3800 parâmetros por statement

  try {
    await client.query('BEGIN');
    for (let i = 0; i < deduped.length; i += BATCH) {
      const batch = deduped.slice(i, i + BATCH);
      const tuples: string[] = [];
      const params: unknown[] = [];
      batch.forEach((o, j) => {
        const base = j * COLS;
        tuples.push(`(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(',')})`);
        params.push(...orderValues(environmentId, o));
      });
      const { rows } = await client.query(
        `INSERT INTO orders (${ORDER_COLUMNS.join(', ')}) VALUES ${tuples.join(',')}${UPSERT_CONFLICT_SQL}`,
        params,
      );
      for (const row of rows as Array<{ inserted: boolean }>) {
        if (row.inserted) inserted++;
        else updated++;
      }
    }
    await client.query('COMMIT');
    return { inserted, updated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type PendingSyncFilters = {
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export async function listPendingSync(
  environmentId: string,
  filters: PendingSyncFilters = {},
): Promise<Array<OrderRecord & { id: number }>> {
  const pool = getPool();
  const params: unknown[] = [environmentId];
  let sql = `SELECT * FROM orders WHERE environment_id = $1 AND "isSync" = FALSE`;
  let idx = 2;
  if (filters.startDate) {
    sql += ` AND timestamp >= $${idx++}`;
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    sql += ` AND timestamp <= $${idx++}`;
    params.push(filters.endDate);
  }
  sql += ` ORDER BY timestamp ASC LIMIT $${idx++}`;
  params.push(filters.limit ?? 5000);
  const { rows } = await pool.query(sql, params);
  return rows as Array<OrderRecord & { id: number }>;
}

export async function updateOrderContact(
  environmentId: string,
  order: string,
  item: string,
  fields: { email?: string; customer?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (fields.email !== undefined) {
    sets.push(`email = $${idx++}`);
    params.push(fields.email);
  }
  if (fields.customer !== undefined) {
    sets.push(`customer = $${idx++}`);
    params.push(fields.customer);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = NOW()');
  params.push(environmentId, order, item);
  const pool = getPool();
  await pool.query(
    `UPDATE orders SET ${sets.join(', ')}
     WHERE environment_id = $${idx++} AND "order" = $${idx++} AND item = $${idx++}`,
    params,
  );
}

export async function markOrdersAsSynced(
  environmentId: string,
  keys: Array<{ order: string; item: string }>,
): Promise<number> {
  if (keys.length === 0) return 0;
  const pool = getPool();
  let updatedTotal = 0;
  // Lotes de pares (order, item) — evita um UPDATE por linha
  const BATCH = 200;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    const tuples: string[] = [];
    const params: unknown[] = [environmentId];
    let idx = 2;
    for (const k of batch) {
      tuples.push(`($${idx++}, $${idx++})`);
      params.push(k.order, k.item);
    }
    const { rowCount } = await pool.query(
      `UPDATE orders SET "isSync" = TRUE, updated_at = NOW()
       WHERE environment_id = $1 AND ("order", item) IN (${tuples.join(',')})`,
      params,
    );
    updatedTotal += rowCount ?? 0;
  }
  return updatedTotal;
}
