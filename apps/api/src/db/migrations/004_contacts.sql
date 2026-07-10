-- Migration 004: contatos (Fase 3) — tabela única que é registro + fila.
--
-- Substitui a reprocessing_queue em SQLite do conector de origem, corrigindo
-- as dívidas mapeadas no PLANO.md:
--   - retry sem backoff  → next_attempt_at com backoff exponencial
--   - contato descartado após N tentativas → status 'dead' (dead-letter
--     auditável; reprocessável voltando o status para 'pending')
--
-- payload JSONB guarda o corpo original do webhook (fonte da verdade);
-- as colunas extraídas existem para exibição/filtro no painel.

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  environment_id UUID NOT NULL REFERENCES tenant_environments(id) ON DELETE CASCADE,
  customer_id TEXT,
  email TEXT,
  cpf TEXT,
  first_name TEXT,
  last_name TEXT,
  bday TEXT,
  phone TEXT,
  mobile TEXT,
  gender TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  opt_in BOOLEAN,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_env_status ON contacts (environment_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_env_created ON contacts (environment_id, created_at DESC);
-- Índice da fila: quem está elegível pra processamento agora
CREATE INDEX IF NOT EXISTS idx_contacts_queue
  ON contacts (environment_id, next_attempt_at)
  WHERE status IN ('pending','failed');
