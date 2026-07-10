/**
 * Motor de pedidos: busca no VTEX OMS, enriquecimento de email/CPF via
 * Master Data (CL) e transformação para o formato Emarsys.
 *
 * Porte do conector de origem, parametrizado por environment. Tudo que era
 * marca hardcoded virou configuração em flow settings:
 *  - salesChannelMap  (ex: {"1": "Conta Principal", "5": "APP"})
 *  - invalidEmailDomains (domínios de email a descartar, além do hash VTEX)
 *  - storeId (valor padrão de s_store_id; senão usa o hostname do pedido)
 */

import axios, { type AxiosInstance } from 'axios';
import { createHash } from 'node:crypto';
import type { OrderRecord } from './repo.js';

export type VtexOrdersConfig = {
  baseUrl: string;
  appKey: string;
  appToken: string;
  tag: string;
};

export type OrdersFlowSettings = {
  debug?: boolean;
  salesChannelMap?: Record<string, string>;
  invalidEmailDomains?: string[];
  storeId?: string;
  filePrefix?: string;
  lookbackHours?: number;
  statusFilter?: string;
  maxPages?: number;
};

// ── Cliente VTEX OMS ─────────────────────────────────────────────────────────

export function createOmsClient(cfg: VtexOrdersConfig): AxiosInstance {
  const client = axios.create({
    baseURL: cfg.baseUrl,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': cfg.appKey,
      'X-VTEX-API-AppToken': cfg.appToken,
    },
    timeout: 30_000,
  });

  // Retry com backoff exponencial para 5xx/erros de rede
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config as (typeof error.config & { retryCount?: number }) | undefined;
      if (!config) return Promise.reject(error);
      config.retryCount = config.retryCount ?? 0;

      const retryable =
        !error.response ||
        error.response.status >= 500 ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';

      if (config.retryCount < 3 && retryable) {
        config.retryCount++;
        console.log(`🔄 [oms][${cfg.tag}] Tentativa ${config.retryCount}/3 para ${config.url}`);
        await new Promise((r) => setTimeout(r, Math.pow(2, config.retryCount) * 1000));
        return client.request(config);
      }
      return Promise.reject(error);
    },
  );

  return client;
}

// ── Busca por período ────────────────────────────────────────────────────────

type OmsListResponse = {
  list?: Array<Record<string, unknown> & { orderId: string; creationDate?: string }>;
  paging?: { pages?: number; currentPage?: number };
};

export async function getAllOrdersInPeriod(
  client: AxiosInstance,
  tag: string,
  startDateISO: string,
  endDateISO: string,
  settings: OrdersFlowSettings = {},
): Promise<Array<{ orderId: string }>> {
  const PER_PAGE = 100;
  const MAX_PAGES = settings.maxPages ?? 100;
  const statusFilter = settings.statusFilter ?? 'invoiced';

  console.log(`🔄 [oms][${tag}] Buscando pedidos de ${startDateISO} até ${endDateISO} (status: ${statusFilter})`);

  const allOrders: Array<{ orderId: string }> = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages && page <= MAX_PAGES) {
    try {
      const params: Record<string, string | number> = {
        f_creationDate: `creationDate:[${startDateISO} TO ${endDateISO}]`,
        per_page: PER_PAGE,
        page,
        orderBy: 'creationDate,asc',
      };
      if (statusFilter) params.f_status = statusFilter;

      const res = await client.get<OmsListResponse>('/api/oms/pvt/orders', { params });
      const list = res.data?.list ?? [];

      if (list.length > 0) {
        allOrders.push(...(list as Array<{ orderId: string }>));
        console.log(`✅ [oms][${tag}] Página ${page}: ${list.length} pedidos (acumulado: ${allOrders.length})`);

        const paging = res.data?.paging;
        if (paging?.pages) {
          const currentPage = paging.currentPage ?? page;
          hasMorePages = currentPage < paging.pages && page < MAX_PAGES;
        } else {
          // Heurística: página cheia → provavelmente há mais
          hasMorePages = list.length === PER_PAGE;
        }
        page++;
      } else {
        hasMorePages = false;
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data === 'object'
          ? JSON.stringify(error.response?.data)
          : error instanceof Error
            ? error.message
            : String(error);
      if (message.includes('Max page exceed')) {
        console.warn(`⚠️ [oms][${tag}] Limite de páginas da VTEX atingido na página ${page}`);
        hasMorePages = false;
      } else {
        throw error;
      }
    }

    if (hasMorePages) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`🎉 [oms][${tag}] Busca concluída: ${allOrders.length} pedidos`);
  return allOrders;
}

export type VtexOrderDetail = {
  orderId?: string;
  status?: string;
  creationDate?: string;
  hostname?: string;
  salesChannel?: string | number;
  clientProfileData?: { email?: string; document?: string };
  customerEmail?: string;
  paymentData?: { transactions?: Array<{ payments?: Array<{ paymentSystemName?: string }> }> };
  marketingData?: { coupon?: string };
  totals?: Array<{ id: string; value?: number }>;
  items?: Array<{
    refId?: string;
    quantity?: number;
    sellingPrice?: number;
    price?: number;
    priceTags?: Array<{ value: number }>;
  }>;
};

export async function getOrderById(
  client: AxiosInstance,
  orderId: string,
): Promise<VtexOrderDetail | null> {
  try {
    const res = await client.get<VtexOrderDetail>(`/api/oms/pvt/orders/${orderId}`);
    return res.data;
  } catch (error) {
    console.error(`❌ [oms] Erro ao obter pedido ${orderId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// ── Email / CPF ──────────────────────────────────────────────────────────────

/** Sempre rejeita emails mascarados da VTEX; domínios extras vêm de settings. */
export function isValidCustomerEmail(email: string | null | undefined, settings: OrdersFlowSettings): email is string {
  if (!email || !email.includes('@')) return false;
  if (email.includes('@ct.vtex.com.br')) return false;
  for (const domain of settings.invalidEmailDomains ?? []) {
    if (domain && email.toLowerCase().includes(domain.toLowerCase())) return false;
  }
  return true;
}

function formatCpf(cpf: string): string {
  const clean = cpf.replace(/\D+/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Busca email do cliente na CL (Master Data) via CPF — tenta sem e com
 * formatação (pontos e traço), como no conector de origem.
 */
export async function getCustomerEmailByDocument(
  client: AxiosInstance,
  tag: string,
  document: string,
  settings: OrdersFlowSettings,
): Promise<string | null> {
  const cleanDocument = document.replace(/\D+/g, '');
  if (cleanDocument.length < 11) return null;

  const searchByDocument = async (docToSearch: string): Promise<string | null> => {
    try {
      const response = await client.get('/api/dataentities/CL/search', {
        params: {
          _where: `document=${docToSearch}`,
          _fields: 'email,id,document',
          _size: 1,
        },
        headers: { Accept: 'application/vnd.vtex.ds.v10+json' },
        timeout: 10_000,
      });
      const data = response.data as Array<{ email?: string }> | undefined;
      const email = data?.[0]?.email;
      return isValidCustomerEmail(email, settings) ? email : null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      console.error(`❌ [cl][${tag}] Erro ao buscar CPF ${docToSearch}:`, error instanceof Error ? error.message : error);
      return null;
    }
  };

  let email = await searchByDocument(cleanDocument);
  if (!email && cleanDocument.length === 11) {
    email = await searchByDocument(formatCpf(cleanDocument));
  }
  return email;
}

// ── Transformação pedido → linhas do banco ───────────────────────────────────

/**
 * Explode um pedido VTEX em uma linha por item, com rateio exato de frete e
 * desconto entre os itens (o último item recebe o resíduo do arredondamento).
 */
export function transformOrderToRows(
  order: VtexOrderDetail,
  email: string | null,
  settings: OrdersFlowSettings,
): OrderRecord[] {
  const rows: OrderRecord[] = [];
  const orderId = order.orderId;
  if (!orderId) return rows;

  let finalEmail = email;
  if (!finalEmail) {
    const candidate = order.clientProfileData?.email || order.customerEmail || null;
    finalEmail = isValidCustomerEmail(candidate, settings) ? candidate : null;
  }

  if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
    console.warn(`⚠️ Pedido ${orderId}: sem itens válidos, não será salvo`);
    return rows;
  }

  const validItemsCount = order.items.filter((item) => item.refId && item.refId !== orderId).length;

  const salesChannelMap = settings.salesChannelMap ?? {};
  const rawChannel = String(order.salesChannel ?? '');
  const salesChannelMapped = salesChannelMap[rawChannel] || rawChannel;
  const storeHostname = order.hostname || '';
  const storeId = settings.storeId || storeHostname;
  const pagamento = order.paymentData?.transactions?.[0]?.payments?.[0]?.paymentSystemName || '';
  const cupom = order.marketingData?.coupon || '';
  const rawDoc = order.clientProfileData?.document || '';
  const cpf = rawDoc.replace(/\D+/g, '');
  const customer = cpf ? sha256Hex(cpf) : null;

  let totalDiscountValue = 0;
  let totalShippingValue = 0;
  if (order.totals && Array.isArray(order.totals)) {
    const discounts = order.totals.find((t) => t.id === 'Discounts');
    const shipping = order.totals.find((t) => t.id === 'Shipping');
    if (discounts?.value !== undefined && discounts.value !== null) {
      totalDiscountValue = Math.abs(discounts.value) / 100;
    }
    if (shipping?.value !== undefined && shipping.value !== null) {
      totalShippingValue = shipping.value / 100;
    }
  }

  const baseDiscountPerItem = validItemsCount > 0 ? totalDiscountValue / validItemsCount : 0;
  const baseShippingPerItem = validItemsCount > 0 ? totalShippingValue / validItemsCount : 0;

  let itemIndex = 0;
  let totalDistributedDiscount = 0;
  let totalDistributedShipping = 0;

  for (const item of order.items) {
    const itemId = item.refId;
    if (!itemId || itemId === orderId) {
      console.warn(`⚠️ Pedido ${orderId}: item sem refId válido, pulando`);
      continue;
    }
    itemIndex++;

    let itemPrice = item.sellingPrice ?? item.price ?? 0;
    // O OMS retorna sellingPrice/price em CENTAVOS (sempre inteiro).
    // A heurística do conector de origem (`> 1000`) deixava passar preços de
    // R$ 0,01 a R$ 10,00 sem conversão — aqui todo inteiro é tratado como
    // centavos; valores fracionários já estão em reais.
    if (itemPrice > 0 && Number.isInteger(itemPrice)) {
      itemPrice = itemPrice / 100;
    }

    let itemShipping: number;
    if (itemIndex === validItemsCount) {
      itemShipping = totalShippingValue - totalDistributedShipping;
    } else {
      itemShipping = parseFloat(baseShippingPerItem.toFixed(2));
      totalDistributedShipping += itemShipping;
    }
    itemPrice = itemPrice + itemShipping;

    let itemDiscount: string;
    if (itemIndex === validItemsCount) {
      itemDiscount = (totalDiscountValue - totalDistributedDiscount).toFixed(2);
    } else {
      itemDiscount = baseDiscountPerItem.toFixed(2);
      totalDistributedDiscount += parseFloat(itemDiscount);
    }

    rows.push({
      order: orderId,
      item: itemId,
      email: finalEmail,
      quantity: item.quantity ?? 1,
      price: itemPrice.toFixed(2),
      timestamp: order.creationDate ?? null,
      isSync: false,
      order_status: order.status ?? null,
      s_channel_source: rawChannel,
      s_store_id: storeId,
      s_sales_channel: 'Online',
      s_discount: itemDiscount,
      customer,
      s_canal: salesChannelMapped,
      s_loja: storeHostname,
      s_tipo_pagamento: pagamento,
      s_cupom: cupom,
      f_valor_desconto: itemDiscount,
    });
  }

  return rows;
}

// ── Transformação linhas do banco → registros Emarsys ────────────────────────

export type EmarsysSaleRecord = {
  order: string;
  item: string;
  customer: string | null;
  quantity: number | string;
  timestamp: string;
  price: string;
  s_sales_channel: string;
  s_store_id: string;
  s_canal: string;
  s_loja: string;
  s_tipo_pagamento: string;
  s_cupom: string;
  f_valor_desconto: string;
};

const CANCELED_STATUSES = ['canceled', 'refunded', 'returned'];

export function transformRowsForEmarsys(
  dbRows: Array<OrderRecord & { id?: number }>,
  settings: OrdersFlowSettings,
): { records: EmarsysSaleRecord[]; canceledCount: number; skippedNoCustomer: number } {
  const records: EmarsysSaleRecord[] = [];
  let canceledCount = 0;
  let skippedNoCustomer = 0;

  for (const row of dbRows) {
    // customer (sha256 do CPF) é obrigatório — Emarsys rejeita email puro
    if (!row.customer) {
      skippedNoCustomer++;
      continue;
    }

    const isCanceled = CANCELED_STATUSES.includes(row.order_status ?? '');

    let quantity: number | string = row.quantity ?? 1;
    let price = String(row.price ?? '0');
    let discount = String(row.s_discount ?? row.f_valor_desconto ?? '0');

    if (isCanceled) {
      quantity = -Math.abs(parseFloat(String(quantity)));
      price = `-${Math.abs(parseFloat(price)).toFixed(2)}`;
      // Desconto zero fica '0.00' sem sinal — '-0.00' pode ser rejeitado no parse da Emarsys
      const discountNum = parseFloat(discount);
      discount = !discountNum ? '0.00' : `-${Math.abs(discountNum).toFixed(2)}`;
      canceledCount++;
    }

    records.push({
      order: row.order,
      item: row.item,
      customer: row.customer,
      quantity,
      timestamp: row.timestamp ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      price,
      s_sales_channel: row.s_sales_channel ?? 'Online',
      s_store_id: row.s_store_id ?? settings.storeId ?? '',
      s_canal: row.s_canal ?? '',
      s_loja: row.s_loja ?? '',
      s_tipo_pagamento: row.s_tipo_pagamento ?? '',
      s_cupom: row.s_cupom ?? '',
      f_valor_desconto: discount,
    });
  }

  return { records, canceledCount, skippedNoCustomer };
}
