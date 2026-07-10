-- Migration 003: tabelas de negócio da Fase 2 (produtos + pedidos)
-- Isolamento multi-tenant por environment_id em todas as tabelas.

-- Pedidos (VTEX OMS → Emarsys Sales API).
-- Colunas espelham o conector de origem; a UNIQUE ganha environment_id
-- para permitir o mesmo pedido em environments distintos.
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  "order" TEXT NOT NULL,
  item TEXT NOT NULL,
  email TEXT,
  quantity NUMERIC,
  price NUMERIC,
  timestamp TIMESTAMPTZ,
  "isSync" BOOLEAN DEFAULT FALSE,
  order_status TEXT,
  s_channel_source TEXT,
  s_store_id TEXT,
  s_sales_channel TEXT,
  s_discount TEXT,
  customer TEXT,
  s_canal TEXT,
  s_loja TEXT,
  s_tipo_pagamento TEXT,
  s_cupom TEXT,
  f_valor_desconto TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_key
  ON orders (environment_id, "order", item, COALESCE(order_status, ''));
CREATE INDEX IF NOT EXISTS idx_orders_env_issync ON orders (environment_id, "isSync");
CREATE INDEX IF NOT EXISTS idx_orders_env_timestamp ON orders (environment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_env_email ON orders (environment_id, email);

-- Snapshot de produtos por environment (substitui os arquivos JSON/CSV locais
-- do conector de origem). Recarregado a cada sync de produtos.
CREATE TABLE IF NOT EXISTS products (
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  title TEXT,
  link TEXT,
  image TEXT,
  category TEXT,
  available TEXT,
  description TEXT,
  price NUMERIC,
  msrp NUMERIC,
  group_id TEXT,
  c_stock INTEGER,
  c_sku_id TEXT,
  c_product_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (environment_id, item)
);

-- Histórico de execuções de sync (jobs em background, error logs e stats).
-- Substitui o Map em memória (global.jobStatus) e os logs em arquivo dos originais.
CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  flow TEXT NOT NULL CHECK (flow IN ('products','orders','contacts','wishlist')),
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','cron')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  stats JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_env_started ON sync_runs (environment_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs (status);
