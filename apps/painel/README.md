# Emarsys-Connector Painel

Painel web de monitoramento de integrações **VTEX → SAP Emarsys**. Exibe em tempo real o status de pedidos, contatos e produtos sincronizados pelo conector. Produto genérico — configurável por cliente via variáveis de ambiente.

**Demo:** [emarsys-painel-connector.vercel.app](https://emarsys-painel-connector.vercel.app) (dados mockados)

---

## Pré-requisitos

- Node.js 18+
- npm 9+
- Conector Emarsys (Hope Emarsys Connector) rodando e acessível via HTTP

---

## Instalação

```bash
npm install
```

---

## Configuração

### Desenvolvimento local com backend real

Crie o arquivo `.env.local` na raiz do projeto:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Substitua `http://localhost:3000` pelo endereço do conector do cliente.

### Desenvolvimento local sem backend (dados mockados)

Deixe `NEXT_PUBLIC_API_URL` **vazio ou não defina**. O painel usa as rotas internas `/api/*` com dados de exemplo.

### Produção (Vercel)

Configure a variável de ambiente no painel do projeto no Vercel:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.cliente.com.br` (URL do conector em produção) |

Se deixar em branco, continua usando os dados mockados.

---

## Rodando em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3001](http://localhost:3001) (ou a porta disponível).

---

## Build de produção

```bash
npm run build
npm start
```

---

## Deploy no Vercel

```bash
vercel deploy --prod --scope <seu-team-slug>
```

---

## Estrutura de pastas

```
src/
├── app/
│   ├── page.tsx                    # Dashboard principal
│   ├── pedidos/                    # Listagem de pedidos com filtros e paginação
│   ├── contatos/                   # Listagem de contatos com filtros client-side
│   ├── produtos/                   # Status de sincronização do catálogo
│   ├── sistema/                    # Métricas de sistema e cron jobs
│   └── api/                        # Rotas mock (usadas quando sem backend)
│       ├── health/
│       ├── emarsys/sales/
│       ├── emarsys/contacts/
│       ├── metrics/
│       ├── vtex/products/
│       ├── cron-management/
│       ├── integration/sync/
│       └── background/
├── components/
│   ├── layout/                     # Sidebar (colapsável + mobile) e Header
│   ├── dashboard/                  # MetricCard, gráficos, CronJobsTable
│   ├── data-table/                 # DataTable genérico + definições de colunas
│   │   └── columns/
│   │       ├── orders.columns.tsx  # 13 colunas CSV de pedidos
│   │       ├── contacts.columns.tsx# Campos relevantes dos 16 campos de contato
│   │       └── products.columns.tsx# 13 colunas CSV de produtos
│   └── ui/                         # Componentes shadcn/ui
├── hooks/                          # Hooks TanStack Query (polling 30s)
│   ├── useHealth.ts
│   ├── useOrders.ts
│   ├── useSyncStats.ts
│   ├── useContacts.ts
│   ├── useContactsStats.ts
│   ├── useProducts.ts
│   ├── useProductStats.ts
│   ├── useCronJobs.ts
│   ├── useSystemMetrics.ts
│   ├── useErrorLogs.ts
│   └── useBackgroundJobs.ts
├── lib/
│   ├── api.ts                      # Instância Axios com interceptors
│   ├── utils.ts                    # cn, formatDate, formatCurrency, getDateRange
│   └── export.ts                   # exportToCSV com BOM UTF-8
├── providers/
│   ├── QueryProvider.tsx           # TanStack Query client
│   └── ThemeProvider.tsx           # next-themes (claro/escuro/sistema)
└── types/
    └── api.ts                      # Tipos TypeScript de todos os recursos
```

---

## Schemas de dados

### Pedidos — 13 colunas (CSV → Emarsys HAPI)

| Campo | Tipo | Descrição |
|---|---|---|
| `item` | string | SKU do produto |
| `price` | number \| null | Preço unitário |
| `order` | string | Número do pedido |
| `timestamp` | string | Data/hora do pedido |
| `customer` | string \| null | ID do cliente |
| `quantity` | number \| null | Quantidade |
| `s_sales_channel` | string \| null | Canal de vendas |
| `s_store_id` | string \| null | ID da loja |
| `s_canal` | string \| null | Canal |
| `s_loja` | string \| null | Nome da loja |
| `s_tipo_pagamento` | string \| null | Tipo de pagamento |
| `s_cupom` | string \| null | Cupom aplicado |
| `f_valor_desconto` | string \| null | Valor do desconto |

Campos de controle adicionais: `email`, `isSync`, `order_status`, `created_at`, `updated_at`.

### Contatos — 16 campos (Webhook → Emarsys)

| Campo | Obrigatório | Tipo |
|---|---|---|
| `customer_id` | sim | string |
| `client_type` | sim | `'hope'` \| `'resort'` |
| `email` | sim | string |
| `country` | sim | string |
| `opt_in` | sim | boolean |
| `cpf` | não | string |
| `first_name` | não | string |
| `last_name` | não | string |
| `bday` | não | string (YYYY-MM-DD) |
| `phone` | não | string |
| `mobile` | não | string |
| `gender` | não | string |
| `address` | não | string |
| `city` | não | string |
| `state` | não | string |
| `postal_code` | não | string |

Campos de controle: `status`, `attempts`, `last_error`, `payload`, `created_at`, `updated_at`.

### Produtos — 13 colunas (CSV → SFTP)

| Campo | Tipo | Descrição |
|---|---|---|
| `item` | string | SKU |
| `title` | string | Nome do produto |
| `link` | string \| null | URL da página |
| `image` | string \| null | URL da imagem |
| `category` | string \| null | Categoria |
| `available` | boolean \| string \| null | Disponível em estoque |
| `description` | string \| null | Descrição |
| `price` | number \| null | Preço de venda |
| `msrp` | number \| null | Preço de tabela |
| `group_id` | string \| null | ID do grupo |
| `c_stock` | number \| null | Quantidade em estoque |
| `c_sku_id` | string \| null | ID do SKU |
| `c_product_id` | string \| null | ID do produto pai |

---

## Endpoints necessários no backend

| Método | Rota | Usado em |
|---|---|---|
| GET | `/health` | Header — indicador de status da API |
| GET | `/api/emarsys/sales/sync-status` | Dashboard, Pedidos — totais e taxa de sincronização |
| GET | `/api/emarsys/sales/db-sample` | Pedidos — listagem paginada com filtros |
| GET | `/api/emarsys/contacts/latest` | Contatos — listagem (suporta `?limit=N`) |
| GET | `/api/metrics/contacts/retry-status` | Dashboard, Contatos — contadores por status |
| GET | `/api/vtex/products/stats` | Produtos — status do último sync |
| GET | `/api/vtex/products` | Produtos — listagem do catálogo |
| GET | `/api/cron-management/status` | Dashboard, Sistema — status dos cron jobs |
| GET | `/api/metrics/json` | Sistema — métricas de uptime, memória e requisições |
| GET | `/api/integration/sync/error-logs` | Dashboard, Sistema — log de erros |
| GET | `/api/background/jobs` | Produtos — jobs em background |

### Parâmetros de filtro — Pedidos (`/api/emarsys/sales/db-sample`)

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `limit` | number | Itens por página |
| `offset` | number | Deslocamento para paginação |
| `isSync` | boolean | Filtrar por status de sincronização |
| `startDate` | string (ISO) | Data inicial |
| `endDate` | string (ISO) | Data final |
| `email` | string | Filtrar por e-mail do cliente |
| `customer_id` | string | Filtrar por ID do cliente |
| `order_status` | string | Filtrar por status do pedido na VTEX |
| `s_loja` | string | Filtrar por loja |
| `s_canal` | string | Filtrar por canal |

---

## Tech stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| Estilo | Tailwind CSS v4 + shadcn/ui (slate base, CSS variables) |
| Temas | next-themes — claro / escuro / sistema |
| Fontes | DM Sans (corpo) + DM Mono (dados) |
| Data fetching | TanStack Query v5 — polling 30s, staleTime 20s |
| Tabelas | TanStack Table v8 — paginação server-side (pedidos) e client-side (contatos) |
| Gráficos | Recharts — LineChart e DonutChart |
| Animações | Framer Motion — fade+slide com stagger por índice |
| HTTP | Axios com response interceptor para normalização de erros |
| Exportação | CSV com BOM UTF-8 |
| Deploy | Vercel |
