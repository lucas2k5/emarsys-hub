-- Migration 006: persiste a flag de fan-out do webhook de contatos.
-- Sem ela o worker não sabe se o contato foi distribuído a múltiplos
-- environments (informação usada no campo custom buyer_type, quando mapeado).
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS fan_out BOOLEAN NOT NULL DEFAULT FALSE;
