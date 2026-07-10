// ─── Pedidos (CSV → Emarsys HAPI) ───────────────────────────────────────────
// 13 colunas: item, price, order, timestamp, customer, quantity,
// s_sales_channel, s_store_id, s_canal, s_loja,
// s_tipo_pagamento, s_cupom, f_valor_desconto
export type Order = {
  id: number
  order: string
  item: string
  price: number | null
  timestamp: string
  customer: string | null
  quantity: number | null
  s_sales_channel: string | null
  s_store_id: string | null
  s_canal: string | null
  s_loja: string | null
  s_tipo_pagamento: string | null
  s_cupom: string | null
  f_valor_desconto: string | null
  // campos de controle do banco
  email: string | null
  isSync: boolean
  order_status: string | null
  s_channel_source: string | null
  s_discount: string | null
  created_at: string
  updated_at: string
}

export type OrdersResponse = { orders: Order[]; total: number }

export type OrderFilters = {
  limit?: number
  offset?: number
  isSync?: boolean
  startDate?: string
  endDate?: string
  email?: string
  customer_id?: string
  order_status?: string
  s_loja?: string
  s_canal?: string
}

export type SyncStats = {
  total: number
  pending: number
  synced: number
  lastSync: string | null
  percentSynced: number
}

// ─── Contatos (Webhook → Emarsys) ───────────────────────────────────────────
// 16 campos — * = opcionais (omitidos quando vazios)
// customer_id, client_type, email, cpf*, first_name*, last_name*, bday*,
// phone*, mobile*, gender*, address*, city*, state*, country, postal_code*, opt_in
export type ContactStatus = 'pending' | 'sent' | 'failed' | 'dead'
// Slug do environment de origem do contato — sempre DADO vindo do banco,
// nunca um conjunto fechado de marcas (Regra 2 do CLAUDE.md).
export type ClientType = string

export type Contact = {
  id: number
  customer_id: string | null
  client_type: ClientType
  email: string | null
  cpf: string | null
  // campos opcionais do webhook
  first_name: string | null
  last_name: string | null
  bday: string | null
  phone: string | null
  mobile: string | null
  gender: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  opt_in: boolean | null
  // controle do banco
  payload: string
  status: ContactStatus
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ContactsStats = {
  total: number
  pending: number
  sent: number
  failed: number
  dead: number
  byClientType?: Array<{ client_type: ClientType; status: ContactStatus; count: number }>
}

// ─── Produtos (CSV → SFTP) ───────────────────────────────────────────────────
// 13 colunas: item, title, link, image, category, available, description,
// price, msrp, group_id, c_stock, c_sku_id, c_product_id
export type Product = {
  item: string
  title: string
  link: string | null
  image: string | null
  category: string | null
  available: boolean | string | null
  description: string | null
  price: number | null
  msrp: number | null
  group_id: string | null
  c_stock: number | null
  c_sku_id: string | null
  c_product_id: string | null
}

export type ProductSyncStats = {
  total: number
  lastSync: string | null
  lastFile: string | null
  status: 'ok' | 'error' | 'never'
}

// ─── Sistema ─────────────────────────────────────────────────────────────────
export type CronJob = {
  name: string
  running: boolean
  lastRun: string | null
  nextRun: string | null
  schedule: string
}

export type HealthStatus = {
  ok: boolean
  uptime: number
  memory?: { used: number; total: number; percent: number }
  timestamp: string
}

export type SystemMetrics = {
  requests?: { total: number; errors: number; rate: number }
  memory?: { used: number; total: number; percent: number }
  uptime?: number
}

export type ErrorLog = {
  orderId: string
  message: string
  timestamp: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export type AuthUser = {
  id: string
  email: string
  role: 'admin' | 'viewer'
}

// ─── Tenants / Ambientes ─────────────────────────────────────────────────────
export type TenantStatus = 'active' | 'inactive'

export type Tenant = {
  id: string
  slug: string
  name: string
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

export type TenantDetail = Tenant & {
  environments: Environment[]
}

export type Environment = {
  id: string
  slug: string
  name: string
  status: 'active' | 'inactive'
}

export type ConnectionKind =
  | 'vtex'
  | 'vtex_io_app'
  | 'emarsys_oauth2'
  | 'emarsys_wsse'
  | 'emarsys_sales_api'
  | 'sftp_products'
  | 'contacts_webhook'

export type Connection = {
  kind: ConnectionKind
  config: Record<string, string>
  hasSecrets: boolean
}

export type FieldMapping = {
  fieldKey: string
  emarsysFieldId: string
  isExternalId: boolean
}

export type FlowKey = 'products' | 'orders' | 'contacts' | 'wishlist'

export type Flow = {
  flow: FlowKey
  enabled: boolean
  cronExpression: string | null
  settings: Record<string, unknown>
}

export type EnvironmentDetail = Environment & {
  connections: Connection[]
  fieldMappings: FieldMapping[]
  flows: Flow[]
}
