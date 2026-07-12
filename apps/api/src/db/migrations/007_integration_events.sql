-- Migration 007: trilha de auditoria de integração (Fase produto).
--
-- Cada interação com sistema externo vira um evento com payload enviado,
-- resposta/erro e latência. Regras de privacidade aplicadas na GRAVAÇÃO
-- (modules/audit.ts): headers de auth nunca entram; CPFs são mascarados
-- (***.***.XXX-XX); hashes sha256 (customer_id) são preservados íntegros.
-- Retenção: eventos expulsos por idade (erros 90d, demais 30d — ver audit.ts).

CREATE TABLE IF NOT EXISTS integration_events (
  id BIGSERIAL PRIMARY KEY,
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  run_id UUID REFERENCES sync_runs(id) ON DELETE SET NULL,
  flow TEXT NOT NULL CHECK (flow IN ('products','orders','contacts','wishlist')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  event TEXT NOT NULL,
  subject TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status_code INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_int_events_env_created ON integration_events (environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_int_events_env_level ON integration_events (environment_id, level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_int_events_subject ON integration_events (environment_id, subject);
CREATE INDEX IF NOT EXISTS idx_int_events_created ON integration_events (created_at);

ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hub_api_full ON integration_events;
CREATE POLICY hub_api_full ON integration_events FOR ALL TO hub_api USING (true) WITH CHECK (true);
