# emarsys-hub

Plataforma **multi-tenant** de integração **VTEX ↔ SAP Emarsys** — um único produto,
100% configurável pelo painel, que sincroniza produtos, pedidos, contatos e wishlists
de N clientes (cada um com N ambientes) sem clonar repositório nem editar `.env`.

| | |
|---|---|
| **Painel** | Next.js 16 · React 19 · TanStack Query · Tailwind v4 · shadcn/ui |
| **API** | Node 22 · TypeScript/ESM · Express · serverless-ready (Vercel) |
| **Banco** | PostgreSQL (Supabase em produção) · migrations idempotentes no boot |
| **Infra** | Vercel (painel + API) · Supabase (Postgres com RLS) |

---

## O que ele faz

Cada **cliente** (tenant) tem **ambientes** (ex: loja principal + outlet), e cada
ambiente tem suas próprias credenciais, mapeamentos de campos e automações:

| Automação | Fluxo | Destaques |
|---|---|---|
| **Produtos** | Catálogo VTEX → CSV (13 colunas) → SFTP Emarsys | Ativos + inativos em 3 passos; snapshot no banco; guarda anti-catálogo-vazio |
| **Pedidos** | VTEX OMS → Emarsys Sales Data API | Rateio exato de frete/desconto por item; valores negativos p/ cancelados; enriquecimento de email via Master Data (CL por CPF); checkpoint incremental |
| **Contatos** | Webhook público → dedupe → Emarsys Contacts API v3 | Árvore de dedupe por CPF/email (converte leads, remove duplicados); fila Postgres com backoff exponencial e **dead-letter auditável**; fan-out para N ambientes |
| **Wishlist** | VTEX Master Data → Emarsys wishlist/update | Scroll **incremental de verdade** (`updatedIn > checkpoint`); SKU→RefId com cache |

Tudo agendável pelo painel em linguagem natural ("a cada 30 minutos", "diariamente
às 03:00") — traduzido para cron por trás.

## Princípios de arquitetura

- **Zero marca em código** — clientes existem apenas como *dados* (rows em `tenants`).
  Field IDs da Emarsys, mapas de canais de venda, domínios de email inválidos: tudo é
  configuração por ambiente, nunca constante.
- **Isolamento por ambiente** — toda tabela de negócio carrega `environment_id`
  (FK + índice); toda query filtra por ele. Token OAuth2 cacheado **por ambiente**
  (sem colisão entre contas Emarsys).
- **Secrets nunca saem** — credenciais criptografadas com **AES-256-GCM**
  (formato versionado `v1:k1:<iv>:<cipher>:<tag>`); a API só expõe `hasSecrets: boolean`.
- **Filas que não perdem nada** — retry com backoff exponencial (`next_attempt_at`),
  claim concorrente-seguro (`FOR UPDATE SKIP LOCKED`) e dead-letter reprocessável
  em vez de descarte silencioso.
- **Serverless-ready** — a API roda como processo contínuo (scheduler residente via
  croner) *ou* serverless (Vercel): init único por cold start, trabalho em background
  via `waitUntil`, e tick externo (`/internal/cron/tick`) no lugar do scheduler.

## Estrutura do monorepo

```
apps/
  api/                  # @emarsys-hub/api — Express/TS (porta 4000)
    api/index.js        #   entry serverless (Vercel)
    scripts/            #   seed-admin, import-env (migração de .env legado)
    src/
      db/               #   pool pg + migrations SQL (aplicadas no boot)
      http/             #   auth (cookie HttpOnly + JWT), CRUD, endpoints de dados, webhooks
      modules/          #   motores: products, orders, contacts, wishlist, emarsys (oauth2)
      scheduler/        #   scheduler dinâmico (croner) + runDueFlows (modo tick)
      tenancy/          #   crypto AES-256-GCM + contexto de environment
  painel/               # @emarsys-hub/painel — Next.js 16 App Router (porta 3000)
    src/app/[tenant]/   #   dashboards: visão geral, pedidos, produtos, contatos, wishlist, sistema
    src/app/clientes/   #   CRUD de clientes: dados, ambientes, conexões, campos Emarsys, automações
    src/app/api/        #   mocks (modo dev sem API)
packages/
  shared/               # tipos compartilhados do contrato API ↔ painel
docs/PLANO.md           # plano macro, decisões e histórico das fases
```

## Rodando localmente

Pré-requisitos: Node ≥ 22, pnpm, Docker (para o Postgres local).

```bash
# 1. Postgres local (porta 5433)
docker compose --env-file .env up -d postgres

# 2. .env na raiz (veja .env.example): DATABASE_URL, ENCRYPTION_KEY (64 hex),
#    JWT_SECRET, NEXT_PUBLIC_API_URL=http://localhost:4000

# 3. Instalar e criar o admin (idempotente)
pnpm install
ADMIN_EMAIL=admin@exemplo.com ADMIN_PASSWORD=SuaSenha pnpm --filter @emarsys-hub/api seed:admin

# 4. Subir (dois terminais)
pnpm dev:api      # API em :4000 — roda migrations no boot
pnpm dev:painel   # Painel em :3000
```

**Modo mock**: com `NEXT_PUBLIC_API_URL` vazio (e fora de produção) o painel roda
sozinho com dados de exemplo — útil pra mexer em UI sem backend.

### Qualidade

```bash
pnpm --filter @emarsys-hub/api test        # vitest — crypto, CSV, rateio, dedupe, wishlist
pnpm --filter @emarsys-hub/api typecheck
pnpm --filter @emarsys-hub/painel exec tsc --noEmit
```

## Produção (Vercel + Supabase)

Dois projetos Vercel a partir deste repo:

| Projeto | Root Directory | Env vars |
|---|---|---|
| API | `apps/api` | `DATABASE_URL` (pooler Supabase, porta 6543), `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, `PAINEL_ORIGIN` |
| Painel | `apps/painel` | `API_PROXY_TARGET` (URL da API), `NEXT_PUBLIC_API_URL` (URL do próprio painel) |

Pontos que valem saber:

- **Proxy do painel** — `vercel.app` está na Public Suffix List, então painel e API em
  subdomínios distintos são *sites* diferentes e o cookie de sessão (SameSite=Lax) não
  cruzaria. O painel proxeia `/api`, `/auth`, `/health` e `/webhooks` pro backend via
  rewrites `beforeFiles` — o browser só fala com um origin.
- **Scheduler em serverless** — sem processo residente, as automações rodam via
  `POST /internal/cron/tick` (header `Authorization: Bearer $CRON_SECRET`), que executa
  todos os fluxos habilitados cujo cron venceu. Configure um pinger por minuto
  (ex: cron-job.org); o cron nativo da Vercel fica como fallback diário.
- **RLS deny-all** — todas as tabelas têm Row Level Security sem policies públicas;
  a REST API do Supabase não lê nada. A API conecta com uma role dedicada com
  policies próprias.
- **Migrations** — aplicadas automaticamente no primeiro request após deploy
  (registro na tabela `migrations`, atômico e idempotente).

## Webhook de contatos

```
POST /webhooks/contacts/:tenantSlug
Authorization: <token da connection contacts_webhook do ambiente>
```

- Token comparado em tempo constante; respostas uniformes (401) contra enumeração;
  rate limit por IP.
- Roteamento: `environment: "<slug>"` no payload → um ambiente específico;
  sem indicação → **fan-out** para todos os ambientes autorizados pelo token.
- Responde `202` e processa em background com dedupe + retry + dead-letter.

## Ferramentas de operação

- `pnpm --filter @emarsys-hub/api seed:admin` — cria/atualiza usuário do painel.
- `pnpm --filter @emarsys-hub/api import:env` — importa o `.env` de um conector
  legado como tenant/ambiente (dry-run por padrão; `--apply` grava; automações
  entram desabilitadas e em modo debug).
- `settings.debug: true` em qualquer automação — executa o fluxo inteiro **sem
  tocar sistemas externos** (rodada sombra para validar configuração).

## Licença

Projeto privado. Todos os direitos reservados.
