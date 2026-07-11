# CLAUDE.md — emarsys-hub

Plataforma **multi-tenant** de integração VTEX ↔ Emarsys. Substitui 5 conectores single-tenant
por um único produto configurável pelo painel (sem clonar repo nem editar `.env` por cliente).

## Regras de ouro — NUNCA violar

1. **Os 5 repositórios originais são intocáveis** (rodam em produção; aqui só entram CÓPIAS):
   `/Users/luhem/Emarsys-Connector`, `/Users/luhem/Emarsys-Connector_Altenburg`,
   `/Users/luhem/Emarsys-painel-connector`, `/Users/luhem/hope-clients-connector-main`,
   `/Users/luhem/hope-wishlist-connector-main` — referência READ-ONLY.
2. **Nomenclatura 100% genérica**: nenhuma marca (hope/altenburg/resort) hardcoded em código —
   marcas só existem como DADOS (rows em `tenants`). Na UI a label é "Clientes"; no código, `tenant`.
3. **Nenhum nome de consultoria** em código, comentários ou docs (o autor é consultor independente).
4. **Commits só quando o usuário pedir** — decisão dele, sempre.
5. Secrets de tenant **nunca** saem descriptografados pela API (só `hasSecrets: boolean`).

## Plano e estado

Plano macro completo (schema, decisões, 6 fases): **`docs/PLANO.md`** — leia antes de qualquer trabalho.

| Fase | Estado |
|---|---|
| 0 — Fundação (scaffold, compose, painel em mock) | ✅ concluída |
| 1 — Tenancy + crypto + auth + CRUD `/clientes` + seletor `[tenant]` | ✅ implementada, revisada pelo code-reviewer, correções aplicadas |
| 2 — Motor produtos/pedidos (copiar do Altenburg, parametrizar por environment, scheduler dinâmico, 11 endpoints de dados com filtro por tenant) | ✅ implementada, revisada pelo code-reviewer, correções aplicadas |
| 3 — Contatos dedupe (transplantar use cases do hope-clients-connector; fila Postgres com backoff + dead-letter) | ✅ implementada, verificada por roundtrip curl (webhook → 2 environments, backoff, dead-letter); code review aplicado em 10/07 (2 bloqueadores + 6 importantes corrigidos) |
| 4 — Wishlist (porte TS do Java; corrigir checkpoint que não filtrava o scroll) | ✅ implementada, verificada com mock local, code review aplicado em 10/07 |
| 5 — Produção (produto genérico) | ✅ **NO AR** (11/07/2026): painel https://emarsys-hub-painel.vercel.app + API https://emarsys-hub-api.vercel.app + Supabase (`emarsys-hub`, sa-east-1, role dedicada `hub_api` com policies RLS próprias). Painel proxeia a API via rewrites beforeFiles (vercel.app está na PSL — cookie não cruzaria subdomínios). Envs setadas via Vercel CLI. Pendente: pinger por minuto no `/internal/cron/tick` (cron-job.org) e senha forte pro admin |

## Stack e estrutura

pnpm workspaces (sem Turborepo). Node >= 22.

- `apps/api` — **@emarsys-hub/api**: TypeScript/ESM/Express, porta 4000.
  - `src/db/` — pool pg + migrations SQL idempotentes (aplicadas no boot)
  - `src/tenancy/crypto.ts` — AES-256-GCM, ciphertext `v1:k1:<iv>:<cipher>:<tag>`, chave em `ENCRYPTION_KEY`
  - `src/http/` — auth (cookie HttpOnly `hub_session`, jose JWT, scrypt, rate limit no login) + CRUD tenants/environments
  - `src/{modules,scheduler}/` — vazios, reservados pras Fases 2-4
- `apps/painel` — **@emarsys-hub/painel**: Next.js 16 App Router, React 19, TanStack Query v5, shadcn/ui, Tailwind v4, react-hook-form+zod.
  - `src/app/[tenant]/…` — páginas de dados (dashboard, pedidos, contatos, produtos, sistema)
  - `src/app/clientes/…` — CRUD de tenants (tabs: Dados/Ambientes/Conexões/Campos Emarsys/Fluxos)
  - Modo mock: `NEXT_PUBLIC_API_URL` vazio + `NODE_ENV !== 'production'` → route handlers internos em `src/app/api/**`
- `packages/shared` — tipos do contrato API↔painel.

## Como rodar (dev)

```bash
# Postgres do hub (porta 5433 — NÃO conflita com o 5432 do Altenburg)
docker compose --env-file .env up -d postgres

# .env na raiz (gitignored): POSTGRES_*, DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET, NEXT_PUBLIC_API_URL
# Seed do admin (idempotente; senha SÓ por env var):
ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @emarsys-hub/api seed:admin

pnpm dev:api      # API em :4000 (dotenv com fallback pra raiz do monorepo)
pnpm dev:painel   # Painel em :3000 (com NEXT_PUBLIC_API_URL=http://localhost:4000 pra modo real)
```

Typecheck: `pnpm --filter @emarsys-hub/api typecheck` / `pnpm --filter @emarsys-hub/painel exec tsc --noEmit`.
Não há suite de testes ainda (pendência herdada — considerar na Fase 2+).

## Contrato REST (Fase 1)

- `POST /auth/login` `{email,password}` → `{user}` + cookie | `POST /auth/logout` | `GET /auth/me`
- `/api/*` exige auth. JSON camelCase; erros `{success:false,error,timestamp}`.
- `GET|POST /api/tenants`, `GET|PATCH|DELETE /api/tenants/:slug` (DELETE exige status inactive → senão 409),
  `POST /api/tenants/:slug/environments`
- `GET|PATCH|DELETE /api/environments/:envId` (DELETE exige inactive),
  `PUT /api/environments/:envId/connections/:kind` (kinds: vtex, vtex_io_app, emarsys_oauth2, emarsys_wsse,
  emarsys_sales_api, sftp_products, contacts_webhook; `secrets` opcional, criptografado, nunca retorna),
  `PUT /api/environments/:envId/field-mappings`, `PUT /api/environments/:envId/flows/:flow`
  (flows: products, orders, contacts, wishlist)

## Contexto de negócio essencial

- Cliente = tenant; 1 tenant tem N environments (ex: Hope → Hope + Hope Resort), cada um com
  credenciais/field mappings/fluxos próprios. Isolamento de dados por `environment_id`.
- Os field IDs Emarsys (ex: email=3, cpf=4884) eram hardcoded no hope-clients-connector — aqui são
  dados em `emarsys_field_mappings`.
- `environment_flows.checkpoint` (JSONB) substitui checkpoints em arquivo dos projetos antigos.
- Dívidas dos originais que o hub corrige de propósito: retry sem backoff, dead-letter inexistente,
  cache de token colidindo entre contas, checkpoint de wishlist quebrado — ver `docs/PLANO.md`.

## Ambiente desta máquina

- O binário `grep` do shell está QUEBRADO (shim defeituoso do claude-code no PATH — erro
  "claude native binary not installed"). Use a ferramenta Grep dedicada ou `rg`/`awk`/`sed -n`.
  `find` também falha às vezes; prefira `ls`.
- Docker Desktop disponível. Postgres do Altenburg pode estar na 5432; o do hub usa 5433.
