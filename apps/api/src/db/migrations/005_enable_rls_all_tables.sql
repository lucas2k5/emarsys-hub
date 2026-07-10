-- Migration 005: RLS em todas as tabelas (defesa em profundidade).
--
-- No Supabase, tabelas sem RLS ficam legíveis via PostgREST com a anon key.
-- RLS habilitado SEM policies = nega tudo pela REST API. A API do hub conecta
-- via Postgres direto (role postgres/owner), que não é sujeita a RLS.
-- Em Postgres local o comando é inócuo (idempotente).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE emarsys_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE migrations ENABLE ROW LEVEL SECURITY;