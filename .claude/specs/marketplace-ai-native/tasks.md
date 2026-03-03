# Implementation Plan — Marketplace AI-Native

## Task Overview
Implementacao completa do marketplace em 4 fases. Cada task e atomica (1-3 arquivos, 15-30 min).

## Steering Document Compliance
- Segue structure.md: feature-first, vertical slicing, kebab-case
- Segue tech.md: Drizzle direto, Fastify adapter, Vitest, pnpm workspaces

## Atomic Task Requirements
- **File Scope**: 1-3 arquivos por task
- **Time Boxing**: 15-30 minutos
- **Single Purpose**: Um resultado testavel
- **Specific Files**: Caminhos exatos
- **Agent-Friendly**: Input/output claros

## Tasks

### Fase 0 — Alicerce

- [ ] 1. Create root monorepo configuration
  - Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
  - Initialize pnpm workspace with all apps and packages
  - Configure Turborepo pipelines (build, dev, test, lint)
  - Base TypeScript config with strict mode
  - _Requirements: REQ-1_

- [ ] 2. Create apps/api package.json and NestJS entry point
  - Files: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`
  - NestJS with Fastify adapter
  - Basic app bootstrap with port 3001
  - _Requirements: REQ-1_

- [ ] 3. Create apps/web package.json and Next.js config
  - Files: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.js`
  - Next.js 14 with App Router
  - Tailwind CSS configuration
  - _Requirements: REQ-1_

- [ ] 4. Create apps/workers package.json and entry point
  - Files: `apps/workers/package.json`, `apps/workers/tsconfig.json`, `apps/workers/src/main.ts`
  - BullMQ worker bootstrap
  - _Requirements: REQ-1_

- [ ] 5. Create packages/database with Drizzle config
  - Files: `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/database/src/index.ts`, `packages/database/drizzle.config.ts`
  - Drizzle ORM setup with PostgreSQL connection
  - _Requirements: REQ-1_

- [ ] 6. Create packages/shared with types and enums
  - Files: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
  - UserRole enum, EventEnvelope type, base DTOs
  - _Requirements: REQ-1_

- [ ] 7. Create packages/ai-gateway scaffold
  - Files: `packages/ai-gateway/package.json`, `packages/ai-gateway/tsconfig.json`, `packages/ai-gateway/src/index.ts`
  - AIGateway interface definition
  - _Requirements: REQ-7_

- [ ] 8. Create packages/ui scaffold
  - Files: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`
  - Base UI package for shared shadcn/ui components
  - _Requirements: REQ-1_

- [ ] 9. Create packages/testing scaffold
  - Files: `packages/testing/package.json`, `packages/testing/tsconfig.json`, `packages/testing/src/index.ts`
  - Test database helper, fixtures structure
  - _Requirements: REQ-1_

- [ ] 10. Create Docker Compose for PostgreSQL + Redis
  - Files: `infra/docker/docker-compose.yml`, `infra/docker/init-scripts/init.sql`
  - PostgreSQL 16 with pgvector + PostGIS extensions
  - Redis 7 for BullMQ
  - Health checks and volumes
  - _Requirements: REQ-1_

- [ ] 11. Create Drizzle schema for users table
  - Files: `packages/database/src/schema/users.ts`, `packages/database/src/schema/index.ts`
  - Users table with all columns from data model
  - UserRole enum type
  - _Requirements: REQ-2_

- [ ] 12. Create Drizzle schema for profiles table
  - Files: `packages/database/src/schema/profiles.ts`
  - Profiles table with pgvector embedding column
  - PostGIS geography column for location
  - GIN/GiST/IVFFlat indexes
  - _Requirements: REQ-3_

- [ ] 13. Create Drizzle schema for audit_log and outbox tables
  - Files: `packages/database/src/schema/audit-log.ts`, `packages/database/src/schema/outbox.ts`
  - Audit log append-only table
  - Outbox pattern table
  - _Requirements: REQ-12_

- [ ] 14. Create NestJS AppModule with database connection
  - Files: `apps/api/src/app.module.ts`, `apps/api/src/config/database.config.ts`
  - Database module with Drizzle provider
  - Config module for environment variables
  - _Requirements: REQ-1_

- [ ] 15. Create Auth module — JWT strategy and token service
  - Files: `apps/api/src/modules/auth/services/auth.service.ts`, `apps/api/src/modules/auth/services/token.service.ts`, `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
  - JWT signing/verification
  - Refresh token rotation
  - Password hashing with bcrypt
  - _Requirements: REQ-2_

- [ ] 16. Create Auth controller — register, login, refresh, logout
  - Files: `apps/api/src/modules/auth/controllers/auth.controller.ts`, `apps/api/src/modules/auth/dto/`
  - Register, login, refresh, logout endpoints
  - Input validation DTOs
  - _Requirements: REQ-2_

- [ ] 17. Create Auth module definition
  - Files: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`
  - NestJS module wiring
  - JWT auth guard
  - _Requirements: REQ-2_

- [ ] 18. Create RBAC guards
  - Files: `apps/api/src/common/guards/roles.guard.ts`, `apps/api/src/common/decorators/roles.decorator.ts`
  - Roles guard checking user role against required roles
  - @Roles() decorator
  - _Requirements: REQ-2_

- [ ] 19. Create Rate Limiter
  - Files: `apps/api/src/common/guards/rate-limit.guard.ts`
  - Per-user, per-operation rate limiting via Redis
  - _Requirements: REQ-2_

- [ ] 20. Create Audit Log service
  - Files: `apps/api/src/modules/audit/audit.service.ts`, `apps/api/src/modules/audit/audit.module.ts`
  - Append-only audit log with correlationId
  - _Requirements: REQ-12_

- [ ] 21. Create Outbox pattern + Event Dispatcher
  - Files: `apps/api/src/common/events/outbox.service.ts`, `apps/api/src/common/events/event-dispatcher.service.ts`
  - Outbox write within transaction
  - Polling dispatcher to publish events
  - _Requirements: REQ-12_

- [ ] 22. Create Event Envelope and CorrelationId
  - Files: `packages/shared/src/events/event-envelope.ts`, `apps/api/src/common/interceptors/correlation-id.interceptor.ts`
  - Event envelope with schema validation (zod)
  - CorrelationId middleware/interceptor
  - _Requirements: REQ-12_

- [ ] 23. Create Structured Logger
  - Files: `apps/api/src/common/logger/structured.logger.ts`
  - JSON structured logs with correlationId
  - _Requirements: REQ-12_

### Fase 1 — MVP Core

- [ ] 24. Create Profiles module — service and CRUD
  - Files: `apps/api/src/modules/profiles/services/profile.service.ts`, `apps/api/src/modules/profiles/controllers/profile.controller.ts`, `apps/api/src/modules/profiles/dto/`
  - CRUD operations for profiles
  - Photo upload endpoint
  - _Requirements: REQ-3_

- [ ] 25. Create Profile Views tracking
  - Files: `packages/database/src/schema/profile-views.ts`, `apps/api/src/modules/profiles/services/profile-views.service.ts`
  - Record views with source and duration
  - _Requirements: REQ-10_

- [ ] 26. Create Search module — full-text search
  - Files: `apps/api/src/modules/search/services/search.service.ts`, `apps/api/src/modules/search/controllers/search.controller.ts`
  - PostgreSQL FTS search
  - Autocomplete suggestions
  - _Requirements: REQ-4_

- [ ] 27. Create Search module — geolocation search
  - Files: `apps/api/src/modules/search/services/geo-search.service.ts`
  - PostGIS proximity search
  - _Requirements: REQ-4_

- [ ] 28. Create Reviews module
  - Files: `packages/database/src/schema/reviews.ts`, `apps/api/src/modules/reviews/services/review.service.ts`, `apps/api/src/modules/reviews/controllers/review.controller.ts`
  - CRUD for reviews with rating validation
  - Trigger sentiment analysis on creation
  - _Requirements: REQ-5_

- [ ] 29. Create Moderation module
  - Files: `apps/api/src/modules/moderation/services/moderation.service.ts`, `apps/api/src/modules/moderation/controllers/moderation.controller.ts`
  - Moderation queue management
  - Approve/reject endpoints (moderator role)
  - _Requirements: REQ-8_

- [ ] 30. Create Payments module — Stripe Connect
  - Files: `packages/database/src/schema/payments.ts`, `apps/api/src/modules/payments/services/stripe.service.ts`, `apps/api/src/modules/payments/controllers/payments.controller.ts`
  - Stripe Connect onboarding
  - PaymentIntent creation with idempotency
  - _Requirements: REQ-6_

- [ ] 31. Create Wallet and Ledger
  - Files: `packages/database/src/schema/wallets.ts`, `apps/api/src/modules/payments/services/wallet.service.ts`
  - Wallet with optimistic locking
  - Ledger entries (credit/debit)
  - _Requirements: REQ-6_

- [ ] 32. Create Subscriptions module
  - Files: `packages/database/src/schema/subscriptions.ts`, `apps/api/src/modules/subscriptions/services/subscription.service.ts`, `apps/api/src/modules/subscriptions/controllers/subscription.controller.ts`
  - Stripe subscription management
  - Plan types (basic, premium, enterprise)
  - _Requirements: REQ-6_

- [ ] 33. Create Webhooks controller
  - Files: `apps/api/src/modules/webhooks/controllers/stripe-webhook.controller.ts`
  - Stripe webhook handler (payment, subscription events)
  - Signature verification
  - _Requirements: REQ-6_

- [ ] 34. Create Next.js layout and theme
  - Files: `apps/web/src/app/layout.tsx`, `apps/web/tailwind.config.ts`, `apps/web/src/styles/globals.css`
  - Root layout with theme provider
  - Tailwind + shadcn/ui theme
  - _Requirements: REQ-1_

- [ ] 35. Create auth pages (login, register)
  - Files: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/register/page.tsx`
  - Login and register forms with shadcn/ui
  - _Requirements: REQ-2_

- [ ] 36. Create marketplace home page with search
  - Files: `apps/web/src/app/(marketplace)/page.tsx`, `apps/web/src/components/search/semantic-search.tsx`
  - Hero search component
  - Featured profiles grid
  - _Requirements: REQ-4_

- [ ] 37. Create profile detail page
  - Files: `apps/web/src/app/(marketplace)/profiles/[id]/page.tsx`, `apps/web/src/components/profiles/profile-card.tsx`
  - Profile detail with photos, services, reviews
  - _Requirements: REQ-3_

- [ ] 38. Create profile management page (professional)
  - Files: `apps/web/src/app/(marketplace)/dashboard/profile/page.tsx`
  - Edit profile form
  - Photo upload
  - _Requirements: REQ-3_

### Fase 2 — IA Nativa

- [ ] 39. Implement AI Gateway — provider adapters
  - Files: `packages/ai-gateway/src/providers/openai.adapter.ts`, `packages/ai-gateway/src/providers/anthropic.adapter.ts`, `packages/ai-gateway/src/providers/ollama.adapter.ts`
  - Provider-specific adapters implementing AIGateway interface
  - _Requirements: REQ-7_

- [ ] 40. Implement AI Gateway — router and middleware
  - Files: `packages/ai-gateway/src/router/provider-router.ts`, `packages/ai-gateway/src/middleware/pii-sanitizer.ts`, `packages/ai-gateway/src/middleware/circuit-breaker.ts`
  - Provider routing logic
  - PII sanitizer middleware
  - Circuit breaker pattern
  - _Requirements: REQ-7_

- [ ] 41. Implement AI Gateway — semantic cache
  - Files: `packages/ai-gateway/src/middleware/semantic-cache.ts`, `packages/database/src/schema/ai.ts`
  - Embedding cache table
  - Semantic similarity check (> 0.95)
  - _Requirements: REQ-7_

- [ ] 42. Implement AI Gateway — cost tracking
  - Files: `packages/ai-gateway/src/middleware/cost-tracker.ts`
  - Per-operation cost tracking by provider
  - _Requirements: REQ-7_

- [ ] 43. Create Embedding Worker
  - Files: `apps/workers/src/processors/embedding.processor.ts`
  - Process profile created/updated events
  - Generate embeddings via AI Gateway
  - Update profile embedding in database
  - _Requirements: REQ-3, REQ-4_

- [ ] 44. Implement Semantic Search
  - Files: `apps/api/src/modules/search/services/semantic-search.service.ts`
  - pgvector cosine similarity search
  - Combine with full-text for hybrid search
  - _Requirements: REQ-4_

- [ ] 45. Create Moderation Worker
  - Files: `apps/workers/src/processors/moderation.processor.ts`
  - Photo analysis via Vision API
  - Auto-approve or queue for manual review
  - _Requirements: REQ-8_

- [ ] 46. Create Fraud Detection Worker
  - Files: `apps/workers/src/processors/fraud-detection.processor.ts`, `packages/database/src/schema/fraud-scores.ts`
  - Risk score calculation based on features
  - Auto-deactivate high-risk profiles
  - _Requirements: REQ-9_

- [ ] 47. Create Sentiment Analysis Worker
  - Files: `apps/workers/src/processors/sentiment-analysis.processor.ts`
  - Analyze review text via AI Gateway
  - Update sentiment_score and sentiment_label
  - _Requirements: REQ-5_

- [ ] 48. Create Recommendation Service
  - Files: `apps/api/src/modules/recommendations/services/recommendation.service.ts`, `apps/api/src/modules/recommendations/controllers/recommendation.controller.ts`
  - Similar profiles by embedding similarity
  - Personalized recommendations by view history
  - _Requirements: REQ-10_

- [ ] 49. Create Dynamic Pricing Service
  - Files: `apps/api/src/modules/subscriptions/services/pricing.service.ts`
  - Suggest plan based on engagement metrics
  - _Requirements: REQ-11_

- [ ] 50. Create AI Metrics Service
  - Files: `apps/api/src/common/metrics/metrics.service.ts`
  - HTTP metrics, AI cost metrics, queue metrics
  - _Requirements: REQ-12_

### Fase 3 — Escala

- [ ] 51. Create Admin module and dashboard API
  - Files: `apps/api/src/modules/admin/controllers/admin.controller.ts`, `apps/api/src/modules/admin/services/admin.service.ts`
  - Platform statistics, user management
  - _Requirements: REQ-12_

- [ ] 52. Create Admin dashboard pages
  - Files: `apps/web/src/app/admin/page.tsx`, `apps/web/src/app/admin/moderation/page.tsx`
  - Stats dashboard, moderation queue UI
  - _Requirements: REQ-8, REQ-12_

- [ ] 53. Create Notification Worker
  - Files: `apps/workers/src/processors/notification.processor.ts`
  - Email/push notifications for key events
  - _Requirements: REQ-12_

- [ ] 54. OpenAPI documentation setup
  - Files: `apps/api/src/config/swagger.config.ts`
  - Swagger/OpenAPI auto-generated from NestJS decorators
  - _Requirements: REQ-1_
