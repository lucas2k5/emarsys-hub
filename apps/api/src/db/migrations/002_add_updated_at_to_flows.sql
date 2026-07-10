-- Migration 002: adiciona updated_at em environment_flows (omitida no schema inicial)

ALTER TABLE environment_flows
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
