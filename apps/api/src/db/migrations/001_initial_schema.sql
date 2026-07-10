-- Migration 001: schema inicial do hub multi-tenant

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS environment_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'vtex','vtex_io_app','emarsys_oauth2','emarsys_wsse',
    'emarsys_sales_api','sftp_products','contacts_webhook'
  )),
  config JSONB NOT NULL DEFAULT '{}',
  secrets TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (environment_id, kind)
);

CREATE TABLE IF NOT EXISTS emarsys_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  emarsys_field_id TEXT NOT NULL,
  is_external_id BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (environment_id, field_key)
);

CREATE TABLE IF NOT EXISTS environment_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  flow TEXT NOT NULL CHECK (flow IN ('products','orders','contacts','wishlist')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cron_expression TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  checkpoint JSONB,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (environment_id, flow)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
