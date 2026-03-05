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

## Fase 5 — Hardening & UX Polish ✓

### Concluido
- [x] 5.1 Security headers + compression
  - [x] @fastify/helmet (X-Frame-Options, HSTS, X-Content-Type-Options)
  - [x] @fastify/compress (gzip/brotli global compression)
  - [x] Multi-origin CORS via CORS_ORIGINS env var
- [x] 5.2 File upload service (S3 presigned URLs)
  - [x] UploadService (presigned upload/download, delete, public URL)
  - [x] POST /uploads/presigned (JWT protected)
  - [x] DELETE /uploads/:key (admin only)
  - [x] UploadsModule registered in AppModule
- [x] 5.3 Frontend auth middleware
  - [x] Next.js middleware.ts (route protection, admin role check)
  - [x] useAuth hook (JWT decode, setTokens, logout)
  - [x] Cookie + localStorage dual storage for SSR
  - [x] Login/register pages updated with cookie sync
- [x] 5.4 Error boundaries + loading states
  - [x] error.tsx: root, admin, marketplace, auth (pt-BR messages)
  - [x] loading.tsx: root, admin, marketplace, auth (spinner)
  - [x] not-found.tsx (404 page)
- [x] 5.5 WebSocket notification gateway
  - [x] NotificationGateway (Socket.IO, /notifications namespace)
  - [x] User connection tracking + room-based messaging
  - [x] sendToUser, broadcast, getConnectedUsers methods
- [x] 5.6 Email notification delivery
  - [x] EmailService (SendGrid with graceful fallback to log)
  - [x] Typed methods: payment, profile, review, subscription
  - [x] Notification worker updated with actual SendGrid delivery
  - [x] HTML + text templates in pt-BR

## Fase 6 — Polish & Quality ✓

### Concluido
- [x] 6.1 API versioning (/api/v1 global prefix)
  - [x] app.setGlobalPrefix('api/v1', { exclude: ['/health'] })
  - [x] Swagger server updated with /api/v1
- [x] 6.2 Professional dashboard
  - [x] Dashboard layout with sidebar (Perfil, Avaliacoes, Assinatura, Config)
  - [x] Profile stats: views, rating, status
  - [x] Quick actions + recent reviews list
- [x] 6.3 Unit tests (76 tests, 5 core services)
  - [x] AuthService: register, login, refresh, logout (16 tests)
  - [x] ProfileService: CRUD, soft delete, pagination (9 tests)
  - [x] ReviewService: CRUD, duplicate prevention, ownership (13 tests)
  - [x] WalletService: credit, debit, idempotency, locking (10 tests)
  - [x] SearchService: FTS, autocomplete, sanitization (12 tests)
- [x] 6.4 Admin dashboard enhanced
  - [x] 5 stat cards (users, profiles, moderation, GMV, subscriptions)
  - [x] Recent users list with role badges
  - [x] Quick links + refresh button

## Fase 7 — Frontend Completeness & Test Coverage ✓

### Concluido
- [x] 7.1 Frontend API base URL fix (/api/v1 prefix)
- [x] 7.2 Professional dashboard sub-pages
  - [x] Reviews page (star ratings, sentiment badges, pagination)
  - [x] Subscription page (current plan, upgrade/cancel, 3-tier comparison)
  - [x] Settings page (profile form, password change, account deletion)
  - [x] Label UI component added
- [x] 7.3 Additional unit tests (71 tests, 5 files)
  - [x] JwtAuthGuard: canActivate, handleRequest (9 tests)
  - [x] RolesGuard: role matching, denial (10 tests)
  - [x] HttpExceptionFilter: formatting, correlationId (16 tests)
  - [x] ModerationService: queue, approve/reject (22 tests)
  - [x] RecommendationService: embeddings, fallback (14 tests)

## Fase 8 — Observability & E2E ✓

### Concluido
- [x] 8.1 Prometheus metrics endpoint
  - [x] GET /metrics with prom-client (excluded from /api/v1 prefix)
  - [x] Custom counters: http_requests, http_duration, ai_gateway, queue_jobs
  - [x] Global HttpMetricsInterceptor for auto-instrumentation
  - [x] MetricsModule (global) registered in AppModule
- [x] 8.2 Admin user management page (/admin/usuarios)
  - [x] Users table with pagination + search filter
  - [x] Role change dropdown, verify toggle, deactivate
  - [x] Toast notifications for feedback
- [x] 8.3 Playwright E2E setup
  - [x] playwright.config.ts with CI-aware settings
  - [x] 6 smoke tests + 3 auth flow tests
- [x] 8.4 Controller tests (46 tests)
  - [x] AuthController: register, login, refresh, logout, me (18 tests)
  - [x] ProfileController: CRUD, views, pagination (20 tests)
  - [x] HealthController: DB + Redis checks, failures (8 tests)

**Total test count: 164 + 71 + 46 + 9 E2E = 290 tests**

## Fase 9 — Bug Fixes & API Integration ✓

### Concluido
- [x] 9.1 Admin verify user endpoint (PUT /admin/users/:id/verify)
  - [x] VerifyUserDto, AdminService.verifyUser, audit log
- [x] 9.2 Fix moderation route mismatch (/moderation/queue/{id}/{action})
- [x] 9.3 Replace mock data with real API calls
  - [x] Homepage: GET /profiles?limit=6 for featured profiles
  - [x] Profile detail: GET /profiles/:id + GET /reviews/profile/:id
  - [x] Profile not-found.tsx page
  - [x] All TODO mock data comments removed

## Fase 10 — SEO, Performance, Production Deploy ✓

### Concluido
- [x] 10.1 SEO optimization
  - [x] Root layout metadata (OpenGraph, Twitter, title template)
  - [x] sitemap.ts (4 routes, dynamic)
  - [x] robots.ts (block admin/dashboard/api)
- [x] 10.2 Database performance indexes (13 new indexes)
  - [x] Partial indexes: active profiles, pending moderation/outbox
  - [x] DESC indexes: created_at, views_count, search_score
  - [x] Composite: profiles city+state
- [x] 10.3 Crypto/AML/Subscription tests (46 tests)
  - [x] CryptoWalletService (7), CryptoBalanceService (12)
  - [x] BlacklistService (11), SubscriptionService (16)
- [x] 10.4 Production Docker setup
  - [x] docker-compose.prod.yml (resource limits, healthchecks, network isolation)
  - [x] nginx.conf (HTTPS, rate limiting, WebSocket, security headers)
  - [x] .env.production.example template
  - [x] PostgreSQL tuning, Redis hardening

**Total test count: ~336 tests (unit + controller + E2E)**

## Fase 12 — Missing PLAN.md Endpoints ✓

### Concluido
- [x] 12.1 Auth email endpoints
  - [x] POST /auth/verify-email (token-based email verification)
  - [x] POST /auth/forgot-password (reset token, anti-enumeration)
  - [x] POST /auth/reset-password (token validation, password hash update)
  - [x] DTOs: VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto
- [x] 12.2 Profile photo delete
  - [x] DELETE /profiles/:id/photos/:photoIndex (ownership validation)
- [x] 12.3 Moderation reports system
  - [x] reports schema (pgTable with status enum)
  - [x] POST /moderation/reports (any authenticated user)
  - [x] GET /moderation/reports (moderator/admin, paginated)
  - [x] POST /moderation/reports/:id/resolve (moderator/admin)
  - [x] DTOs: CreateReportDto, ResolveReportDto
- [x] 12.4 Admin audit-logs + feature profile
  - [x] GET /admin/audit-logs (paginated, filterable by userId/action/entityType)
  - [x] POST /admin/profiles/:id/feature (toggle featured status)
- [x] 12.5 K6 load tests
  - [x] k6/scripts/search-test.js (FTS + semantic, <500ms p95)
  - [x] k6/scripts/auth-test.js (register/login/me, <200ms p95)
  - [x] k6/scripts/profiles-test.js (list + health, <200ms p95)
- [x] 12.6 Frontend auth pages
  - [x] /forgot-password page (email form, success state)
  - [x] /reset-password page (token from URL, password confirmation)
  - [x] Login page: added "Esqueci minha senha" link
- [x] 12.7 Profile endpoints
  - [x] POST /profiles/:id/photos (add photos with ownership check)
  - [x] POST /profiles/:id/verify (request verification, outbox event)

## Fase 13 — App Mobile (Expo/React Native) ✓

### Concluido
- [x] 13.1 Scaffold Expo project no monorepo (apps/mobile)
  - [x] package.json, app.json, tsconfig.json, babel.config.js, metro.config.js
  - [x] Monorepo-aware metro config (watchFolders, nodeModulesPaths)
- [x] 13.2 NativeWind + Theme
  - [x] tailwind.config.js com cores primary/background/muted/border
  - [x] global.css, nativewind-env.d.ts, babel preset
  - [x] theme.ts (colors, spacing), utils.ts (formatCurrency, formatDate, formatRelativeTime)
- [x] 13.3 API Client + Secure Storage
  - [x] storage.ts (expo-secure-store wrapper)
  - [x] api.ts (fetch wrapper, auto JWT inject, 401 token refresh, ApiError class)
  - [x] Unit test para ApiError
- [x] 13.4 Auth Context + Hooks
  - [x] AuthContext.tsx (AuthProvider, useAuth — login, register, logout, refreshUser)
  - [x] useApi.ts (useApiQuery, useApiPaginated, useApiMutation com TanStack Query)
- [x] 13.5 UI Components (12 componentes)
  - [x] Button (4 variants), Input (label + error), Card (+ Header/Content)
  - [x] Badge (5 variants), Avatar (image + initials fallback), StarRating (interactive)
  - [x] Skeleton (animated pulse), LoadingScreen
  - [x] ProfileCard, ReviewItem, SearchBar (debounced)
- [x] 13.6 Navigation Structure
  - [x] AuthStack (Login, Register, ForgotPassword, ResetPassword)
  - [x] MainTabs (Home, Search, Dashboard, Profile) com nested stacks
  - [x] AdminStack (AdminStats, AdminModeration)
  - [x] Deep linking (marketplace:// + https://)
  - [x] RootNavigator (auth state → AuthStack | MainTabs | AdminStack)
- [x] 13.7 Auth Screens (4 telas)
  - [x] LoginScreen (email + senha, zod validation)
  - [x] RegisterScreen (nome, email, senha, role selector Client/Professional)
  - [x] ForgotPasswordScreen (email input, success state)
  - [x] ResetPasswordScreen (token deep link, nova senha + confirmacao)
- [x] 13.8 Home + Search Screens (4 telas)
  - [x] HomeScreen (search bar + featured profiles FlatList + pull-to-refresh)
  - [x] SearchResultsScreen (search results with filters)
  - [x] ProfileDetailScreen (photo carousel, bio, services, reviews)
  - [x] SemanticSearchScreen (natural language search via POST /search/semantic)
- [x] 13.9 Dashboard Screens (5 telas)
  - [x] DashboardScreen (stats cards + quick actions)
  - [x] EditProfileScreen (form com PATCH mutation)
  - [x] MyReviewsScreen (reviews FlatList com sentiment badges)
  - [x] SubscriptionScreen (3 plans comparison, upgrade/downgrade)
  - [x] SettingsScreen (account info, change password, logout, delete account)
- [x] 13.10 Admin Screens (2 telas)
  - [x] AdminStatsScreen (stat cards: users, profiles, moderation, subscriptions)
  - [x] AdminModerationScreen (queue with approve/reject actions)

**App Mobile: 15 telas, 12 componentes, 38 arquivos TypeScript/TSX**

## Fase 14 — Internacionalizacao (i18n) ✓

### Concluido
- [x] 14.1 Translation files (pt-BR + en-US, 273 chaves cada)
  - [x] Common, Auth, Home, Profile, Dashboard, Admin, Search, Errors, Footer
- [x] 14.2 i18n utility (server-side `t()` + client-side `useTranslation()`)
  - [x] Dot notation keys, variable interpolation `{{name}}`
  - [x] Locale detection via cookie + Accept-Language header
- [x] 14.3 I18nProvider context + LanguageSwitcher component
- [x] 14.4 Middleware locale detection (sem quebrar auth middleware)

## Fase 15 — Melhorias no Algoritmo de Recomendacao ✓

### Concluido
- [x] 15.1 Collaborative filtering (co-view matrix via profile_views)
- [x] 15.2 Weighted scoring (5 sinais: embedding 0.4, rating 0.2, views 0.15, recency 0.1, location 0.15)
- [x] 15.3 Diversity injection (20% de resultados de cidades/servicos diferentes)
- [x] 15.4 Cold start handling (trending profiles dos ultimos 7 dias)
- [x] 15.5 30 unit tests para scoring, recency, normalization, diversity, cold start

## Fase 16 — CDN para Imagens ✓

### Concluido
- [x] 16.1 UploadService CDN methods (getCdnUrl, getImageUrl, getOptimizedProfilePhoto)
  - [x] Preset sizes: thumbnail (80x80), card (400x300), full (1200x900) — all webp
  - [x] CDN_URL env var (optional, fallback to S3 public URLs)
- [x] 16.2 Environment validation (CDN_URL optional in Zod schema)
- [x] 16.3 Upload controller retorna cdnUrl nas presigned responses
- [x] 16.4 ProfileController transforma photos para CDN URLs
- [x] 16.5 Frontend CDN utility (apps/web/src/lib/cdn.ts)
- [x] 16.6 Next.js Image component com CDN + remote patterns
- [x] 16.7 ProfileCard + Profile detail page usam imagens otimizadas

## Fase 17 — Marketplace Multi-Categoria ✓

### Concluido
- [x] 17.1 Categories schema (categories + profile_categories many-to-many)
  - [x] Hierarquia: parentId self-referencing FK para subcategorias
- [x] 17.2 CategoriesModule (Service + Controller)
  - [x] GET /categories — lista com subcategorias em arvore
  - [x] GET /categories/:slug — por slug com profilesCount
  - [x] GET /categories/:slug/profiles — profiles paginados
  - [x] POST /categories — admin only
  - [x] PATCH /categories/:id — admin only
- [x] 17.3 Seed data: 8 categorias principais + 24 subcategorias
- [x] 17.4 Frontend: /categories page (grid com icones) + /categories/[slug] (profiles)
- [x] 17.5 Homepage: secao de categorias + link "Categorias" no nav

## Fase 18 — Chat, Push Notifications, Analytics ✓

### Concluido
- [x] 18.1 Chat em tempo real (Socket.IO + REST fallback)
  - [x] conversations + messages schema (Drizzle)
  - [x] ChatService (getOrCreateConversation, getConversations, getMessages, sendMessage, markAsRead, getUnreadCount)
  - [x] ChatGateway Socket.IO /chat namespace (join_conversation, send_message, typing, mark_read)
  - [x] ChatController REST endpoints
  - [x] Frontend: /chat page com ConversationList, MessageBubble, ChatInput, typing indicator
  - [x] socket.io-client integrado no web app
- [x] 18.2 Push Notifications (Expo Push API)
  - [x] push_tokens schema (Drizzle)
  - [x] PushNotificationService (registerToken, removeToken, sendPushNotification, sendBulkPush)
  - [x] NotificationController: POST/DELETE /notifications/push-token
  - [x] Worker: Channel 4 (Expo push) no notification.worker.ts
  - [x] Mobile: usePushNotifications hook (permissions, token registration, foreground/background handling)
  - [x] PushNotificationInitializer component no App.tsx
- [x] 18.3 Analytics Dashboard (Admin)
  - [x] AnalyticsService (revenue, userGrowth, profiles, search, categories, moderation, overview)
  - [x] AnalyticsController (7 admin-only endpoints)
  - [x] Frontend: /admin/analytics dashboard com SimpleBarChart (pure CSS)
  - [x] Sub-pages: /admin/analytics/revenue, /admin/analytics/users
  - [x] Admin layout + nav link atualizado

## Fase 19 — Mobile Chat/Payments + Testes Phase 18 ✓

### Concluido
- [x] 19.1 Mobile Chat Screens
  - [x] ConversationListScreen (FlatList, pull-to-refresh, unread badges, 10s polling)
  - [x] ChatScreen (inverted FlatList, 3s polling, mark-as-read, KeyboardAvoidingView)
  - [x] ConversationItem component (avatar, last message, timestamp, unread badge)
  - [x] Chat tab adicionado ao MainTabs (entre Search e Dashboard)
- [x] 19.2 Stripe Mobile Payments
  - [x] payments.ts service (wallet, payment intents, subscriptions, idempotency keys)
  - [x] PaymentScreen (wallet balance, add funds, transaction history)
  - [x] BookingPaymentScreen (multi-step: review → processing → success/error)
  - [x] SubscriptionScreen reescrito (4 planos, upgrade/downgrade, cancel)
  - [x] DashboardScreen atualizado com link para Carteira
  - [x] MainTabs atualizado (BookingPayment + Payment routes)
- [x] 19.3 Testes Unitarios Phase 18 (114 novos testes)
  - [x] chat.service.spec.ts (20 testes)
  - [x] chat.controller.spec.ts (19 testes)
  - [x] chat.gateway.spec.ts (21 testes)
  - [x] push-notification.service.spec.ts (16 testes)
  - [x] analytics.service.spec.ts (16 testes)
  - [x] analytics.controller.spec.ts (19 testes)

## Fase 20 — README + E2E Tests ✓

### Concluido
- [x] 20.1 README.md (pt-BR, setup completo, arquitetura, 23 modulos documentados)
- [x] 20.2 Playwright E2E Tests (55 testes: homepage, auth, search, categories, admin)

## Fase 21 — Security Hardening + Infrastructure ✓

### Concluido
- [x] 21.1 Fix RBAC guard faltante no POST /notifications/push (vulnerabilidade)
- [x] 21.2 Replace console.log com NestJS Logger no HttpExceptionFilter
- [x] 21.3 Drizzle migrations completas (38 tabelas, 31 enums, 139 indexes)
- [x] 21.4 Shared types expandidos (17 domain types, 17 enums, API response envelopes)
- [x] 21.5 AML Screening Worker reescrito (screen-user, screen-transaction, periodic-rescreen)
- [x] 21.6 Structured JSON logger para workers

## Fase 22 — Infrastructure Hardening ✓

### Concluido
- [x] 22.1 Webhook retry queue com exponential backoff (5 retries + dead letter)
- [x] 22.2 DB connection pool config (max 20, idle 30s, connect timeout 5s)
- [x] 22.3 Redis caching para recommendations (5min user, 10min similar profiles)
- [x] 22.4 Top-rated profiles fallback quando recommendations falham
- [x] 22.5 Rate limiter Redis key TTL com safety margin (2x window)
- [x] 22.6 Metrics periodic flush a cada 60s com graceful shutdown

## Fase 23 — Quality & Resilience ✓

### Concluido
- [x] 23.1 Frontend auth token persistence
  - [x] Centralized token storage (getAccessToken, saveTokens, clearTokens)
  - [x] Auto-refresh on 401 with retry of original request
  - [x] JWT expiry validation in middleware
  - [x] Cookie max-age corrigido (16min vs 24h)
  - [x] 20+ pages refactored para usar helpers centralizados
- [x] 23.2 Stripe service retry logic (exponential backoff, transient-only)
- [x] 23.3 Pagination validation (ClampPipe em 7 controllers, limit 1-100)
- [x] 23.4 Audit log archival worker (90-day retention, weekly cron, batch processing)
- [x] 23.5 101 novos unit tests
  - [x] categories.service.spec.ts (21 testes)
  - [x] upload.service.spec.ts (18 testes)
  - [x] token.service.spec.ts (17 testes)
  - [x] email.service.spec.ts (14 testes)
  - [x] pricing.service.spec.ts (11 testes)
  - [x] audit.service.spec.ts (11 testes)
  - [x] profile-views.service.spec.ts (9 testes)

**Total test count: 472 tests (31 test files, all passing)**
**E2E test count: 55 Playwright tests (6 test files)**

## SDD Workflow
- [x] Steering documents criados (.claude/steering/)
- [x] Spec criada (.claude/specs/marketplace-ai-native/)
  - [x] requirements.md — 12 requirements com user stories e acceptance criteria
  - [x] design.md — arquitetura completa com Mermaid diagrams
  - [x] tasks.md — 54 atomic tasks (ALL COMPLETE)
- [x] Task commands gerados (54 commands)
- [x] PLAN.md expandido com modelo de dados, APIs, AI Gateway, workers, frontend, testes, monitoramento, roadmap
