# Progress — Marketplace AI-Native

## Fase 0 — Alicerce ✓

### Concluido
- [x] 0.1 Setup monorepo (Turborepo + pnpm) — root config, workspaces, tsconfigs
- [x] 0.2 Docker Compose (PostgreSQL 16 + pgvector + Redis) — com init scripts
- [x] 0.3 NestJS API com Fastify + Drizzle ORM — bootstrap basico
- [x] 0.4 Next.js 14 com App Router + shadcn/ui — layout + tailwind + tema
- [x] 0.5 Schema base: users — Drizzle schema com user_role enum
- [x] 0.5+ Schema completo: profiles, reviews, payments, subscriptions, audit_log, outbox, AI tables
- [x] 0.6 Auth: JWT + refresh token rotativo (family-based reuse detection)
- [x] 0.7 RBAC: guards (admin, moderator, professional, user)
- [x] 0.8 Rate limiter (Redis sliding window, per user/IP)
- [x] 0.9 Audit log (append-only, correlationId aware)
- [x] 0.10 Outbox pattern + event dispatcher (poll-based)
- [x] 0.11 Envelope de eventos + validacao schema (Zod)
- [x] 0.12 CorrelationId em logs e eventos (AsyncLocalStorage)
- [x] Packages inicializados: shared, database, ai-gateway, ui, testing
- [x] Workers app scaffold com BullMQ

## Fase 1 — MVP Core ✓

### Concluido
- [x] 1.1 Profiles CRUD (create, read, update, delete + soft delete)
- [x] 1.2 Profile views tracking (total, unique, windowed stats)
- [x] 1.3 Search — PostgreSQL FTS (to_tsvector portuguese) + prefix matching + filters
- [x] 1.4 Search — PostGIS geo-search (ST_DWithin, ST_Distance) nearby
- [x] 1.5 Search suggestions endpoint
- [x] 1.6 Reviews CRUD (duplicate check, outbox events for sentiment)
- [x] 1.7 Moderation queue (unified: profiles + reviews, approve/reject)
- [x] 1.8 Payments — Stripe Connect (Express accounts, onboarding links)
- [x] 1.9 Payments — Wallet (optimistic locking, idempotency keys)
- [x] 1.10 Payments — PaymentIntent creation + confirmation + payout
- [x] 1.11 Subscriptions — Stripe lifecycle (create, upgrade/downgrade, cancel)
- [x] 1.12 Webhooks — Stripe signature verification + event routing
- [x] 1.13 Frontend — Login + Register pages (API integration, token storage)
- [x] 1.14 Frontend — Home page (HeroSearch + featured profiles grid)
- [x] 1.15 Frontend — Search page (text/semantic toggle, results grid)
- [x] 1.16 Frontend — Profile detail (bio, services, reviews, sidebar CTA)
- [x] 1.17 Frontend — Marketplace layout (sticky header, nav, footer)
- [x] 1.18 Frontend — UI components (Button, Input, Card, Badge)
- [x] 1.19 Frontend — ProfileCard component + HeroSearch component

## Fase 2 — IA Nativa
Status: Nao iniciada

## Fase 3 — Escala
Status: Nao iniciada

## SDD Workflow
- [x] Steering documents criados (.claude/steering/)
- [x] Spec criada (.claude/specs/marketplace-ai-native/)
  - [x] requirements.md — 12 requirements com user stories e acceptance criteria
  - [x] design.md — arquitetura completa com Mermaid diagrams
  - [x] tasks.md — 54 atomic tasks
- [x] Task commands gerados (54 commands)
- [x] PLAN.md expandido com modelo de dados, APIs, AI Gateway, workers, frontend, testes, monitoramento, roadmap
