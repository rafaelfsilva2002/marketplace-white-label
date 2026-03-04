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

## Fase 2 — IA Nativa ✓

### Concluido
- [x] 2.1 AI Gateway: router multi-provider (OpenAI/Anthropic/Ollama) com circuit breaker e fallback
- [x] 2.2 PII sanitizer no AI Gateway (CPF, phone, email, card)
- [x] 2.3 Embedding sync worker (profiles → pgvector via BullMQ)
- [x] 2.4 Busca semantica (pgvector cosine distance + POST /search/semantic)
- [x] 2.5 Recomendacao inteligente (embedding avg + nearest neighbors + fallback top-rated)
- [x] 2.6 Moderacao automatica de fotos (Vision API) + texto via BullMQ worker
- [x] 2.7 Deteccao de fraude: rule-based scoring (5 signals, auto-deactivate on critical)
- [x] 2.8 Analise de sentimento das avaliacoes (LLM + fallback rating-based)
- [x] 2.9 Precificacao dinamica: sugerir plano ideal por metricas do profissional
- [x] 2.10 Cache semantico (SHA-256 exact + cosine similarity > 0.95)
- [x] 2.11 Metricas de custo de IA por operacao (buffered persistence)
- [x] Frontend — SemanticSearch component (debounced dropdown)
- [x] Frontend — AI Assistant widget (chat overlay)
- [x] Frontend — RecommendationsSection (for-you + similar profiles)
- [x] Frontend — Search page atualizada com modo semantico real

## Fase 3 — Escala ✓

### Concluido
- [x] 3.1 Crypto Rails — Adaptadores Ethereum/Polygon/Solana
  - [x] Schema atualizado: crypto_wallets (MPC/Dfns), crypto_balances, crypto_ledger
  - [x] packages/crypto-gateway — CryptoGateway interface + types
  - [x] MockAdapter (dev/testes) + DfnsAdapter (producao)
  - [x] CryptoWalletService (create, list, get wallets por chain)
  - [x] CryptoBalanceService (credit/debit com idempotency + optimistic locking)
  - [x] CryptoPaymentService (fee split 10% plataforma + outbox events)
  - [x] CryptoController + DTOs + CryptoModule (provider factory mock/dfns)
  - [x] RampService (on/off ramp BRL↔crypto)
  - [x] Design: Dfns MPC custody, dual wallet (BRL + crypto), adapter pattern

- [x] 3.2 Compliance AML para transacoes cripto
  - [x] Schema: aml_screenings, suspicious_activity_reports, aml_review_queue, aml_blacklists, aml_rate_limits
  - [x] AmlProvider interface + InternalAmlAdapter (blacklists DB, wallet rate limiting, fraud cross-check)
  - [x] SarService (SAR persistence + lifecycle)
  - [x] ReviewQueueService (approve/reject/assign for moderators)
  - [x] AML Screening Worker (async BullMQ)
  - [x] AmlController (REST endpoints for queue, SARs, blacklists, screenings)
  - [x] BlacklistService (CRUD for admin-managed blacklists)
  - [x] Travel rule for txs > $1000 USD
  - [x] Per-wallet rate limiting

- [x] Spec Tasks 33-54 (completados em batch)
  - [x] Webhooks controller — 10 event handlers + signature verification + rawBody fix + 17 unit tests
  - [x] Profile management page — edit form + photo upload (dashboard/profile)
  - [x] AI Metrics service — HTTP/AI/Queue metrics with in-memory buffering
  - [x] Admin module API — stats, user management, role changes (admin-only)
  - [x] Admin dashboard pages — stats + moderation queue (separate /admin route)
  - [x] Notification Worker — BullMQ worker for payment/profile/review/subscription events
  - [x] OpenAPI/Swagger — auto-generated docs at /api/docs
  - [x] AdminModule registered in AppModule
  - [x] vitest.config.ts for API app

- [x] 3.3 Orquestracao de workflows (workflow engine com steps, retries, timeouts)
  - [x] Schema: workflows, workflow_steps (status tracking, attempt counting)
  - [x] WorkflowEngineService (registry, step execution, exponential backoff)
  - [x] WorkflowController (start workflow, get status, get steps) — admin-only
  - [x] WorkflowsModule registered in AppModule
  - [x] Moderation workflow (4 steps: analyze, flag, auto-approve/escalate, notify)
  - [x] Onboarding workflow (5 steps: validate, embed, fraud check, activate, notify)
  - [x] Outbox events: workflow.started, workflow.completed, workflow.failed

- [x] 3.4 Agentes IA com estado persistido
  - [x] Schema: ai_agents, agent_conversations, agent_messages, agent_actions
  - [x] AgentService (CRUD + multi-turn chat + conversation management)
  - [x] AgentToolsService (5 built-in tools: search, profile, reviews, plan, moderation)
  - [x] AgentController (CRUD, chat, conversations, decision delegation endpoints)
  - [x] AgentsModule registered in AppModule
  - [x] Tool call parsing via regex + AI Gateway follow-up
  - [x] Token + cost tracking per message

- [x] 3.5 A/B testing de modelos e prompts
  - [x] Schema: experiments, experiment_variants, experiment_results
  - [x] ExperimentService (CRUD, variant assignment, result recording, winner detection)
  - [x] ABRouterService (route requests to variant, override AI Gateway params)
  - [x] ExperimentController (create, start, end, results endpoints) — admin-only
  - [x] ExperimentsModule registered in AppModule
  - [x] Deterministic user assignment via hash(experimentId:userId)
  - [x] Metrics: latency, cost, quality score, user rating

- [x] 3.6 Decision delegation (autonomia gradual)
  - [x] DecisionDelegationService (risk classification, auto-execute, approve/reject)
  - [x] Risk map: LOW (auto), MEDIUM (conditional), HIGH (always human)
  - [x] Auto-execute thresholds: 95% approval rate + 20 min actions
  - [x] REST endpoints via AgentController (pending actions, approve, reject, stats)
  - [x] Outbox events: agent.action.requested/approved/rejected/executed

## Fase 4 — Production Readiness ✓

### Concluido
- [x] 4.1 Health check endpoint (GET /health — DB + Redis ping)
  - [x] HealthController com checks de banco e cache
  - [x] HealthModule registered em AppModule (primeiro import)
- [x] 4.2 Global exception filter (HttpExceptionFilter)
  - [x] Structured error responses com correlationId
  - [x] Logging de erros com stack trace
  - [x] Registrado globalmente em main.ts
- [x] 4.3 Environment validation (Zod schema)
  - [x] Schema completo: DATABASE_URL, REDIS_URL, JWT_SECRET, Stripe, AI providers
  - [x] Integrado com ConfigModule.forRoot({ validate })
- [x] 4.4 Dockerfiles (multi-stage builds)
  - [x] apps/api/Dockerfile — NestJS API
  - [x] apps/web/Dockerfile — Next.js standalone
  - [x] apps/workers/Dockerfile — BullMQ workers
  - [x] docker-compose.yml atualizado com servicos api, web, workers
- [x] 4.5 GitHub Actions CI pipeline
  - [x] Lint + typecheck job
  - [x] Test job com PostgreSQL + Redis services
  - [x] Build job (all apps)
- [x] 4.6 Database seed data
  - [x] 5 users (admin, moderator, 2 professionals, 1 user)
  - [x] 2 profiles, 4 reviews, 2 subscriptions
  - [x] Script: packages/database/src/seed/seed.ts
- [x] 4.7 Graceful shutdown
  - [x] enableShutdownHooks() em main.ts
  - [x] SIGTERM + SIGINT handlers com logging

## SDD Workflow
- [x] Steering documents criados (.claude/steering/)
- [x] Spec criada (.claude/specs/marketplace-ai-native/)
  - [x] requirements.md — 12 requirements com user stories e acceptance criteria
  - [x] design.md — arquitetura completa com Mermaid diagrams
  - [x] tasks.md — 54 atomic tasks (ALL COMPLETE)
- [x] Task commands gerados (54 commands)
- [x] PLAN.md expandido com modelo de dados, APIs, AI Gateway, workers, frontend, testes, monitoramento, roadmap
