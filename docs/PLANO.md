# emarsys-hub — Plano do produto multi-tenant

> Consolidação de 5 conectores VTEX↔Emarsys em um único produto multi-tenant,
> 100% configurável pelo painel, sem clonar repositório nem editar `.env` por cliente.
> **Regra de ouro:** os 5 repositórios originais nunca são modificados — só copiamos código deles pra cá.

## Origem (repos analisados, todos locais)

| Repo | Papel | O que aproveitamos |
|---|---|---|
| `Emarsys-Connector` (Hope) | Conector original, SQLite | Referência histórica; motor já evoluído no Altenburg |
| `Emarsys-Connector_Altenburg` | Fork em PostgreSQL | **Base do motor de produtos/pedidos/contatos-webhook** (versão pós-fixes de jul/2026) |
| `Emarsys-painel-connector` | Dashboard Next.js | Copiado para `apps/painel`; ganha auth, `/clientes` e seletor `[tenant]` |
| `hope-clients-connector` | Dedupe de contatos por CPF (TS/hexagonal) | Use cases transplantados; field IDs viram `emarsys_field_mappings` |
| `hope-wishlist-connector` | Wishlist (Java/Quarkus) | **Portado para TS** (~550 linhas de lógica); checkpoint corrigido |

## Decisões aprovadas

- Monorepo novo (`pnpm workspaces`, sem Turborepo por ora) em `/Users/luhem/emarsys-hub`
- **Um serviço unificado** TS/ESM (`apps/api`) — ESM importa os módulos CJS copiados nativamente
- **Wishlist portada para TypeScript** (checkpoint do Java estava quebrado: scroll varria tudo sempre; zero testes a preservar)
- **Docker Compose** na VPS (postgres + api + painel); antigos seguem em PM2 até o cutover
- Criptografia de credenciais: **AES-256-GCM** com `ENCRYPTION_KEY` em env var, formato versionado `v1:<key_id>:<iv>:<cipher>:<tag>`
- Auth do painel: login próprio + JWT em cookie HttpOnly (hoje o painel tem zero auth)
- Tabela `tenants` (não `clients` — "client" já significa contato/consumidor no código legado)
- Nomenclatura 100% genérica: nenhuma marca (hope/altenburg/resort) hardcoded em código — só em dados/seeds

## Schema multi-tenant (Fase 1)

Tabelas novas: `tenants`, `tenant_environments` (1 tenant → N ambientes, ex: Hope + Hope Resort),
`environment_connections` (kind: vtex | vtex_io_app | emarsys_oauth2 | emarsys_wsse | emarsys_sales_api | sftp_products | contacts_webhook;
`config` JSONB legível + `secrets` criptografado), `emarsys_field_mappings` (resolve field IDs 3695/4884/4962/4964 hardcoded),
`environment_flows` (flow: products | orders | contacts | wishlist; enabled, cron_expression, settings, checkpoint JSONB, last_run_at/status),
`users` (auth do painel).

Tabelas de negócio (`orders`, `contacts`, `reprocessing_queue`) ganham `environment_id` (FK + índice); UNIQUE de orders
vira `(environment_id, "order", item, COALESCE(order_status,''))`. `reprocessing_queue` (portada do SQLite) ganha
`status` (pending/processing/dead), `next_attempt_at` (backoff exponencial real) e dead-letter auditável
(corrige perda silenciosa de contatos após 5 tentativas).

## Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0 — Fundação** ✅ | Scaffold monorepo, compose, painel copiado em mock, 2 bugs de shape corrigidos (`.jobs`/`.errors`) | compose validando; painel abre em mock; api `/health` 200 |
| **1 — Tenancy + CRUD + Auth** ✅ | Migrations do schema; `tenancy/crypto.ts` (AES-256-GCM); auth (scrypt + jose + cookie HttpOnly + rate limit no login); CRUD tenants/environments/connections/field-mappings/flows; painel: login, `/clientes` com tabs, segmento `[tenant]` com guard. **Code review aplicado**: 4 bloqueadores + 6 importantes corrigidos (bypass de auth em prod, oráculo de crypto, rota morta de PATCH env, JWT_SECRET obrigatória, internalError genérico, migration runner atômico, mocks de auth deletados, páginas legadas removidas) | Roundtrip completo verificado por curl em 08/07/2026: login→tenant→env→PATCH 200→DELETE 409/204→cascade |
| **2 — Produtos + Pedidos** ✅ | Motor copiado do Altenburg parametrizado por environment (`apps/api/src/modules/{products,orders}`); migration 003 (`orders`/`products`/`sync_runs` com `environment_id`); token OAuth2 cacheado por environment; scheduler dinâmico (croner) lendo `environment_flows` com refresh de 60s; checkpoint incremental de pedidos em `environment_flows.checkpoint` (overlap 1h); 11 endpoints do contrato com filtro `?tenant=`; hooks do painel enviando o tenant; `POST /api/environments/:envId/flows/:flow/run` pra disparo manual; modo `settings.debug` pula envios externos. Guarda anti-catálogo-vazio (falha total da VTEX não zera snapshot). **Code review aplicado em 09/07/2026**: 2 bloqueadores (ClientType/`'hope'|'resort'` no painel → string genérica com badge por hash; `resolveEnvironmentIds` sem filtro de status → só ativos) + 6 importantes (upsert de orders em batch multi-row com dedupe; heurística de centavos corrigida — inteiro=centavos, fixa preços ≤R$10; dedupe do CSV mantém ocorrência mais recente por order+item; datas inválidas → 400 antes de qualquer short-circuit; mutex de renovação de token OAuth2 por environment; run manual só em environment/tenant ativos) + menores (Bearer maiúsculo, '0.00' sem sinal pra desconto zero cancelado, colunas derivadas no batch de products, sftp.end() protegido, aviso de merge raso no checkpoint). Não aplicado: M5 (janela de 6h da guarda de sobreposição — configurável fica pra quando houver catálogo que precise) | Verificado por curl em 09/07/2026: sync DEBUG products/orders pro tenant de teste (falha controlada com creds fake → background jobs + error logs + stats `error`), filtro por tenant isolando dados, scheduler agendando job do banco com nextRun correto, cascade delete limpo |
| **3 — Contatos (dedupe)** ✅ | Use cases de dedupe transplantados (`apps/api/src/modules/contacts/usecases.ts` — árvore com/sem CPF preservada, sem DI); gateway v3 (`gateway.ts`) lendo `emarsys_field_mappings` (defaults só p/ campos de SISTEMA Emarsys 1..37; custom `customer_id`/`cpf`/`buyer_type` exigem mapeamento; `is_external_id` define a chave de upsert); migration 004: tabela `contacts` = registro + fila (claim `FOR UPDATE SKIP LOCKED`, `next_attempt_at` com backoff exponencial `base*2^attempts`, `dead` auditável/reprocessável); webhook público `POST /webhooks/contacts/:tenantSlug` com token por environment (timing-safe) e fan-out: `environment`/`client_type` roteiam, `full` ou ausência → todos os envs autorizados (substitui o 'full' hardcoded); worker no flow `contacts` do scheduler + processamento imediato pós-webhook; endpoints `contacts/latest` e `retry-status` reais (client_type = slug do env); painel: campos `apiBaseUrl` (oauth2) e token estático (sales_api). **Pendente: code review** | Verificado por curl em 09/07/2026: webhook fan-out pra 2 environments do mesmo tenant processado (DEBUG → sent), roteamento explícito e legado, 401/404/400 correta, falha real com creds fake → failed→backoff→dead com last_error preservado, scheduler agendando os 2 envs, cascade delete limpo |
| **4 — Wishlist (porte TS)** ✅ | Porte em `apps/api/src/modules/wishlist/` (~2 arquivos, padrão dos outros módulos): scroll do Master Data **com filtro por checkpoint** (`updatedIn>"<checkpoint>"` no `_where` — corrige o bug do Java, que salvava mas nunca filtrava), token de continuação `X-VTEX-MD-TOKEN`, SKU→RefId com cache por execução, envio `POST /api/v3/wishlist/update` (keyId configurável, default 3=email) com OAuth2 por environment, checkpoint em `environment_flows.checkpoint.lastUpdatedIn` (só avança em execução real, não em debug), flow `wishlist` no scheduler + run manual. Sem code review (decisão do usuário em 09/07) | Verificado em 10/07/2026 com mock local VTEX+Emarsys (porta 4999): run 1 coletou 3 wishlists (checkpoint inicial), run 2 coletou 0 (`_where` já com checkpoint avançado — prova do filtro), run 3 coletou só a wishlist nova; RefIds resolvidos; checkpoint final correto no JSONB |
| **5 — Produção (produto genérico)** 🟡 | **DECISÃO (10/07/2026): NÃO haverá cutover** — o hub é um produto genérico standalone; nenhuma migração de Hope/Altenburg será feita. Os repos originais seguem como referência histórica apenas. O que resta para "completo": deploy de produção (compose na VPS, envs `ENCRYPTION_KEY`/`JWT_SECRET`, domínio+HTTPS — cookie exige `secure` em prod, builds da API e do painel), onboarding de clientes NOVOS 100% pelo painel, e hardening (testes automatizados, code review Fases 3-4, commit inicial do repo). Ferramenta auxiliar: `pnpm --filter @emarsys-hub/api import:env` (genérico, dry-run por padrão) importa o `.env` de qualquer conector legado caso um cliente futuro chegue com um — validado com fixture fake, sem vínculo com marca | Hub em produção aceitando clientes cadastrados pelo painel; zero marca em código |

## Correções que o hub faz de dívidas dos originais

- Retry de contatos sem backoff real → `next_attempt_at` com backoff exponencial
- Contato esgotado era perdido → dead-letter auditável/reprocessável
- Cache de token Emarsys colidia entre contas → chave por `environment_id`
- Checkpoint da wishlist nunca filtrava o scroll (varria tudo) → filtro `updatedIn > checkpoint`
- Checkpoint em `/tmp` (perdido em recreate) → coluna no Postgres
- Mocks do painel com shape errado (`.jobs`/`.errors`) → corrigidos na cópia
- Painel sem auth → login próprio na Fase 1

## Referências

Os relatórios completos de análise dos 5 repos foram produzidos em 08/07/2026 (agentes backend/frontend-tech-lead).
Contrato dos 11 endpoints que o painel consome: ver `src/hooks/` + `src/types/api.ts` em `apps/painel`.
