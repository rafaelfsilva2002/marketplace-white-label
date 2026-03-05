# Marketplace FTM

> Marketplace de servicos profissionais AI-Native — busca semantica, recomendacao inteligente, moderacao automatica e cripto.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![NestJS](https://img.shields.io/badge/NestJS-10-e0234e?logo=nestjs)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+pgvector-336791?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?logo=redis)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)
![Expo](https://img.shields.io/badge/Expo-52-000020?logo=expo)
![Turborepo](https://img.shields.io/badge/Turborepo-2-0f0f0f?logo=turborepo)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker)

---

## Sobre o Projeto

O **Marketplace FTM** e uma plataforma completa de marketplace de servicos profissionais, inspirada no Fatal Model. Diferente de marketplaces tradicionais, a inteligencia artificial esta embutida em toda a experiencia desde o dia 1 — busca semantica com pgvector, recomendacao inteligente por embeddings, moderacao automatica de fotos e texto via Vision API, deteccao de fraude, analise de sentimento de avaliacoes e precificacao dinamica.

A plataforma suporta pagamentos via Stripe Connect e trilhos cripto (Ethereum, Polygon, Solana) com custodia MPC via Dfns, compliance AML integrado e on/off ramp BRL-cripto. Conta com chat em tempo real (Socket.IO), push notifications (Expo Push API), dashboard de analytics para admins, sistema de categorias hierarquicas, internacionalizacao (pt-BR / en-US) e um app mobile completo em React Native/Expo com 15 telas.

A arquitetura segue principios SOLID, TDD, clean architecture com vertical slicing por features, outbox pattern para eventos, e observabilidade completa com Prometheus, audit logs e correlationId em toda a cadeia.

---

## Tech Stack

| Camada | Tecnologia | Descricao |
|--------|-----------|-----------|
| **Frontend Web** | Next.js 14, React 18, Tailwind CSS, shadcn/ui | App Router, RSC, Server Components |
| **App Mobile** | Expo 52, React Native, NativeWind | 15 telas, deep linking, push notifications |
| **Backend API** | NestJS 10, Fastify, TypeScript | REST API, Swagger/OpenAPI, Socket.IO |
| **ORM** | Drizzle ORM | Type-safe, migrations, PostgreSQL nativo |
| **Banco de Dados** | PostgreSQL 16 + pgvector | FTS portugues, busca semantica, PostGIS |
| **Cache/Filas** | Redis 7 + BullMQ | Rate limiting, cache, workers assincronos |
| **IA** | AI Gateway (OpenAI, Anthropic, Ollama) | Circuit breaker, fallback, PII sanitizer |
| **Pagamentos** | Stripe Connect | Express accounts, subscriptions, webhooks |
| **Cripto** | ethers.js, @solana/web3.js, Dfns MPC | Ethereum, Polygon, Solana, custodia MPC |
| **Upload** | AWS S3 + CDN | Presigned URLs, otimizacao de imagens |
| **Email** | SendGrid | Templates pt-BR, fallback graceful |
| **Testes** | Vitest, Playwright, k6 | Unit, E2E, load testing |
| **Monorepo** | Turborepo + pnpm | Workspaces, builds paralelos |
| **CI/CD** | GitHub Actions | Lint, typecheck, test, build |
| **Metricas** | Prometheus (prom-client) | HTTP, AI gateway, queue jobs |
| **Deploy** | Docker multi-stage, Nginx | Compose dev + prod, HTTPS, rate limiting |

---

## Estrutura do Monorepo

```
marketplace/
├── apps/
│   ├── api/              → NestJS API (Fastify) — 23 modulos
│   ├── web/              → Next.js 14 + shadcn/ui — SSR, i18n
│   ├── mobile/           → Expo/React Native — 15 telas, 12 componentes
│   └── workers/          → BullMQ jobs (embeddings, moderacao, fraude, notificacoes)
├── packages/
│   ├── database/         → Drizzle schema + migrations + seed
│   ├── shared/           → Types, DTOs, event schemas
│   ├── ai-gateway/       → Router multi-provider IA (OpenAI/Anthropic/Ollama)
│   ├── crypto-gateway/   → Adaptadores Ethereum/Polygon/Solana + Dfns MPC
│   ├── ui/               → shadcn/ui components compartilhados
│   └── testing/          → Utilitarios de teste
├── infra/
│   └── docker/           → Docker Compose (dev + prod), Nginx, init scripts
├── k6/
│   └── scripts/          → Load tests (search, auth, profiles)
├── docs/
│   └── PLAN.md           → Plano completo do projeto (fases, tasks, arquitetura)
└── .github/
    └── workflows/        → CI pipeline (lint, test, build)
```

---

## Getting Started

### Pre-requisitos

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** e Docker Compose

### Instalacao

```bash
# 1. Clone o repositorio
git clone <repo-url> marketplace
cd marketplace

# 2. Instale as dependencias
pnpm install

# 3. Suba os servicos (PostgreSQL 16 + pgvector, Redis 7)
pnpm docker:up

# 4. Copie e configure as variaveis de ambiente
cp .env.production.example .env
# Edite .env com suas chaves (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.)

# 5. Gere e aplique as migrations do banco
pnpm db:generate
pnpm db:push

# 6. (Opcional) Popule o banco com dados de exemplo
pnpm --filter @marketplace/database seed

# 7. Inicie o servidor de desenvolvimento
pnpm dev
```

Apos o `pnpm dev`, os servicos estarao disponiveis em:

| Servico | URL |
|---------|-----|
| **Web (Next.js)** | http://localhost:3000 |
| **API (NestJS)** | http://localhost:3001 |
| **Swagger/OpenAPI** | http://localhost:3001/api/docs |
| **Health Check** | http://localhost:3001/health |
| **Metricas Prometheus** | http://localhost:3001/metrics |

---

## Scripts Disponiveis

| Comando | Descricao |
|---------|-----------|
| `pnpm dev` | Inicia todos os apps em modo desenvolvimento (Turbo) |
| `pnpm build` | Build de producao de todos os apps |
| `pnpm test` | Executa todos os testes (Vitest) |
| `pnpm lint` | Lint em todos os workspaces |
| `pnpm clean` | Limpa artefatos de build |
| `pnpm docker:up` | Sobe PostgreSQL + Redis via Docker Compose |
| `pnpm docker:down` | Derruba os containers Docker |
| `pnpm db:generate` | Gera migrations Drizzle a partir do schema |
| `pnpm db:migrate` | Aplica migrations pendentes |
| `pnpm db:push` | Push direto do schema para o banco |
| `pnpm --filter @marketplace/api test` | Testes apenas da API |
| `pnpm --filter @marketplace/web test:e2e` | Testes E2E com Playwright |

---

## Destaques da Arquitetura

### Inteligencia Artificial Nativa

- **Busca semantica** — pgvector com embeddings, busca por intencao (nao apenas palavras-chave)
- **Recomendacao inteligente** — collaborative filtering, weighted scoring (5 sinais), diversity injection, cold start handling
- **Moderacao automatica** — fotos via Vision API, texto via LLM, queue de revisao humana
- **Deteccao de fraude** — scoring baseado em 5 sinais, desativacao automatica em risco critico
- **Analise de sentimento** — avaliacoes processadas por LLM com fallback rating-based
- **Precificacao dinamica** — sugestao de plano ideal por metricas do profissional
- **Cache semantico** — SHA-256 exact match + cosine similarity > 0.95
- **Agentes IA com estado** — multi-turn chat, 5 tools built-in, tracking de tokens/custo
- **A/B testing** — experimentos de modelos e prompts com winner detection automatico
- **Decision delegation** — autonomia gradual (LOW auto, MEDIUM condicional, HIGH humano)

### Cripto Rails

- Adaptadores Ethereum, Polygon e Solana
- Custodia MPC via Dfns (sem chaves privadas no servidor)
- Dual wallet (BRL fiat + cripto)
- Fee split automatico (10% plataforma)
- On/off ramp BRL-cripto
- Compliance AML (screening, SARs, blacklists, travel rule, rate limiting por wallet)

### Tempo Real

- **Chat** — Socket.IO com REST fallback, typing indicators, mark as read
- **Notificacoes** — WebSocket gateway + push notifications (Expo Push API)
- **Atualizacoes** — eventos via outbox pattern + BullMQ workers

---

## Modulos da API

A API esta organizada em 23 modulos feature-first:

| # | Modulo | Descricao |
|---|--------|-----------|
| 1 | **auth** | JWT + refresh token rotativo, registro, login, verificacao de email, reset de senha |
| 2 | **profiles** | CRUD de perfis, fotos, verificacao, soft delete |
| 3 | **search** | FTS portugues, busca semantica (pgvector), geo-search (PostGIS), sugestoes |
| 4 | **reviews** | Avaliacoes com duplicate check, sentimento, moderacao |
| 5 | **payments** | Stripe Connect, wallet com optimistic locking, PaymentIntent, payouts |
| 6 | **subscriptions** | Lifecycle Stripe (criar, upgrade/downgrade, cancelar) |
| 7 | **webhooks** | Verificacao de assinatura Stripe, 10 event handlers |
| 8 | **moderation** | Queue unificada (perfis + reviews + reports), approve/reject |
| 9 | **admin** | Stats, gestao de usuarios, roles, audit logs, feature profiles |
| 10 | **categories** | Categorias hierarquicas (parent/child), profiles por categoria |
| 11 | **crypto** | Wallets MPC, balances, payments, on/off ramp |
| 12 | **aml** | Screening AML, SARs, blacklists, travel rule, rate limiting |
| 13 | **chat** | Conversas, mensagens, Socket.IO /chat namespace |
| 14 | **notifications** | Push tokens, WebSocket gateway /notifications, Expo Push |
| 15 | **recommendations** | Embeddings, collaborative filtering, diversity, cold start |
| 16 | **pricing** | Precificacao dinamica por metricas do profissional |
| 17 | **agents** | Agentes IA com estado, multi-turn chat, 5 tools, decision delegation |
| 18 | **experiments** | A/B testing de modelos/prompts, variant assignment, winner detection |
| 19 | **workflows** | Engine de workflows (steps, retries, exponential backoff) |
| 20 | **audit** | Audit log append-only com correlationId |
| 21 | **uploads** | S3 presigned URLs, CDN, otimizacao de imagens |
| 22 | **metrics** | Prometheus (HTTP, AI, queue), metricas de custo IA |
| 23 | **health** | Health check (DB + Redis ping) |

---

## App Mobile

O app mobile (`apps/mobile`) e construido com **Expo 52** e **React Native**, compartilhando types e DTOs do package `@marketplace/shared`.

- **15 telas**: Login, Register, Forgot/Reset Password, Home, Search, Semantic Search, Profile Detail, Dashboard, Edit Profile, My Reviews, Subscription, Settings, Admin Stats, Admin Moderation
- **12 componentes**: Button, Input, Card, Badge, Avatar, StarRating, Skeleton, LoadingScreen, ProfileCard, ReviewItem, SearchBar, etc.
- **Navegacao**: React Navigation com AuthStack, MainTabs (nested stacks), AdminStack
- **Deep linking**: `marketplace://` e `https://` universal links
- **Push Notifications**: Expo Push API com registro automatico de token
- **Auth**: Expo SecureStore, refresh token automatico em 401
- **Data fetching**: TanStack Query com hooks customizados (useApiQuery, useApiPaginated, useApiMutation)
- **Estilizacao**: NativeWind (Tailwind CSS para React Native)

```bash
# Iniciar o app mobile
pnpm --filter @marketplace/mobile start

# Android
pnpm --filter @marketplace/mobile android

# iOS
pnpm --filter @marketplace/mobile ios
```

---

## Testes

O projeto conta com aproximadamente **285+ testes** distribuidos entre:

| Tipo | Ferramenta | Quantidade | Descricao |
|------|-----------|------------|-----------|
| **Unit** | Vitest | ~200 | Services, guards, filters, interceptors |
| **Controller** | Vitest | ~46 | Auth, Profile, Health controllers |
| **E2E** | Playwright | ~9 | Smoke tests + auth flows |
| **Load** | k6 | 3 scripts | Search, auth, profiles (p95 targets) |

```bash
# Todos os testes
pnpm test

# Apenas API
pnpm --filter @marketplace/api test

# Watch mode
pnpm --filter @marketplace/api test:watch

# E2E (requer servidor rodando)
pnpm --filter @marketplace/web test:e2e

# E2E com UI
pnpm --filter @marketplace/web test:e2e:ui

# Load tests (requer k6 instalado)
k6 run k6/scripts/search-test.js
k6 run k6/scripts/auth-test.js
k6 run k6/scripts/profiles-test.js
```

---

## Deploy (Producao)

O projeto inclui configuracao completa para deploy em producao com Docker:

```bash
# Build e start em producao
docker compose -f infra/docker/docker-compose.prod.yml up -d --build
```

A stack de producao inclui:

- **Dockerfiles multi-stage** para API, Web e Workers (builds otimizados)
- **docker-compose.prod.yml** com resource limits, healthchecks e network isolation
- **Nginx** como reverse proxy com HTTPS, rate limiting, WebSocket support e security headers
- **PostgreSQL** com tuning de producao
- **Redis** com hardening (appendonly, maxmemory)
- **Variaveis de ambiente**: veja `.env.production.example` para o template completo

### Servicos em producao

| Servico | Porta | Descricao |
|---------|-------|-----------|
| **Nginx** | 80, 443 | Reverse proxy, HTTPS, static assets |
| **Web** | 3000 | Next.js standalone |
| **API** | 3001 | NestJS + Fastify |
| **Workers** | - | BullMQ background jobs |
| **PostgreSQL** | 5432 | Banco principal + pgvector |
| **Redis** | 6379 | Cache + filas |

---

## Licenca

Projeto privado. Todos os direitos reservados.
