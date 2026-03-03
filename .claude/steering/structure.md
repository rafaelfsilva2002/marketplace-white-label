# Project Structure

## Directory Organization

```
marketplace/
├── apps/
│   ├── web/                    # Next.js 14 + shadcn/ui
│   │   ├── src/
│   │   │   ├── app/            # App Router pages/layouts
│   │   │   │   ├── (auth)/     # Auth pages (login, register)
│   │   │   │   ├── (marketplace)/ # Main marketplace pages
│   │   │   │   ├── admin/      # Admin dashboard
│   │   │   │   └── api/        # API routes (BFF)
│   │   │   ├── components/     # React components
│   │   │   │   ├── ui/         # shadcn/ui base components
│   │   │   │   ├── search/     # Search-related components
│   │   │   │   ├── profiles/   # Profile components
│   │   │   │   └── ai/         # AI-powered components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities and helpers
│   │   │   └── styles/         # Global styles
│   │   ├── public/             # Static assets
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   ├── api/                    # NestJS (Fastify)
│   │   ├── src/
│   │   │   ├── modules/        # Feature modules (vertical slicing)
│   │   │   │   ├── auth/       # Auth module
│   │   │   │   │   ├── controllers/
│   │   │   │   │   ├── services/
│   │   │   │   │   ├── guards/
│   │   │   │   │   ├── strategies/
│   │   │   │   │   ├── dto/
│   │   │   │   │   └── auth.module.ts
│   │   │   │   ├── users/
│   │   │   │   ├── profiles/
│   │   │   │   ├── search/
│   │   │   │   ├── payments/
│   │   │   │   ├── reviews/
│   │   │   │   ├── moderation/
│   │   │   │   ├── subscriptions/
│   │   │   │   ├── admin/
│   │   │   │   └── webhooks/
│   │   │   ├── common/         # Shared infrastructure
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── pipes/
│   │   │   │   ├── logger/
│   │   │   │   └── metrics/
│   │   │   ├── config/         # App configuration
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/               # Integration tests
│   │   │   ├── utils/          # Test utilities
│   │   │   └── *.spec.ts
│   │   └── package.json
│   │
│   └── workers/                # BullMQ jobs
│       ├── src/
│       │   ├── processors/     # Job processors
│       │   │   ├── embedding.processor.ts
│       │   │   ├── moderation.processor.ts
│       │   │   ├── fraud-detection.processor.ts
│       │   │   ├── sentiment-analysis.processor.ts
│       │   │   └── notification.processor.ts
│       │   ├── queues.ts       # Queue definitions
│       │   └── main.ts
│       └── package.json
│
├── packages/
│   ├── database/               # Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── schema/         # Table definitions
│   │   │   │   ├── users.ts
│   │   │   │   ├── profiles.ts
│   │   │   │   ├── reviews.ts
│   │   │   │   ├── payments.ts
│   │   │   │   ├── subscriptions.ts
│   │   │   │   ├── audit-log.ts
│   │   │   │   ├── outbox.ts
│   │   │   │   ├── ai.ts       # embedding_cache, moderation_queue, fraud_scores
│   │   │   │   └── index.ts    # Re-exports
│   │   │   ├── migrations/     # SQL migrations
│   │   │   ├── seed/           # Seed data
│   │   │   └── index.ts        # DB client export
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── shared/                 # Types, DTOs, event schemas
│   │   ├── src/
│   │   │   ├── types/          # TypeScript interfaces
│   │   │   ├── dto/            # Data transfer objects
│   │   │   ├── events/         # Event type definitions
│   │   │   ├── enums/          # Shared enums
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ai-gateway/             # Router multi-provider IA
│   │   ├── src/
│   │   │   ├── interfaces/     # AIGateway interface
│   │   │   ├── providers/      # OpenAI, Anthropic, Ollama adapters
│   │   │   ├── middleware/     # PII sanitizer, rate limiter, cache, circuit breaker
│   │   │   ├── router/         # Provider router logic
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/                     # shadcn/ui components (shared)
│   │   ├── src/
│   │   │   └── components/
│   │   └── package.json
│   │
│   └── testing/                # Test utilities
│       ├── src/
│       │   ├── test-db.ts      # PostgreSQL test container setup
│       │   ├── fixtures/       # Test data fixtures
│       │   └── helpers/        # Test helpers
│       └── package.json
│
├── infra/
│   └── docker/                 # Docker Compose
│       ├── docker-compose.yml
│       └── init-scripts/       # PostgreSQL init (pgvector, PostGIS)
│
├── docs/
│   └── PLAN.md                 # Source of truth
│
├── turbo.json                  # Turborepo config
├── pnpm-workspace.yaml         # pnpm workspaces
├── tsconfig.base.json          # Base TypeScript config
├── .gitignore
├── CLAUDE.md                   # AI assistant rules
└── PROMPT.md                   # Ralph Loop prompt
```

## Naming Conventions

### Files
- **All files**: `kebab-case` (ex: `profile.service.ts`, `auth.controller.ts`)
- **Modules NestJS**: `{feature}.module.ts`
- **Controllers**: `{feature}.controller.ts`
- **Services**: `{feature}.service.ts`
- **Guards**: `{name}.guard.ts`
- **DTOs**: `{action}-{entity}.dto.ts` (ex: `create-profile.dto.ts`)
- **Tests**: `{filename}.spec.ts` (integration), `{filename}.test.ts` (unit)
- **React Components**: `kebab-case` files, `PascalCase` exports
- **Drizzle Schemas**: `{entity}.ts` (singular, ex: `users.ts`, `profiles.ts`)

### Code
- **Classes/Types**: `PascalCase` (ex: `ProfileService`, `CreateProfileDto`)
- **Functions/Methods**: `camelCase` (ex: `findProfileById`, `createEmbedding`)
- **Constants**: `UPPER_SNAKE_CASE` (ex: `MAX_RETRIES`, `EMBEDDING_MODEL`)
- **Variables**: `camelCase`
- **Tabelas DB**: `snake_case`, plural (ex: `users`, `profiles`, `audit_log`)
- **Eventos**: `domain.entity.action` (ex: `marketplace.profile.created`)
- **Enums**: `PascalCase` valores (ex: `UserRole.Professional`)

## Import Patterns

### Import Order
1. External dependencies (`@nestjs/*`, `drizzle-orm`, etc)
2. Internal packages (`@marketplace/database`, `@marketplace/shared`)
3. Relative imports (`./services/`, `../common/`)
4. Type-only imports (`import type { ... }`)

### Module/Package Organization
- Absolute imports via workspace aliases: `@marketplace/database`, `@marketplace/shared`, `@marketplace/ai-gateway`
- Relative imports within a module/package
- No circular dependencies between packages

## Code Structure Patterns

### NestJS Module Organization
```
modules/{feature}/
├── controllers/          # HTTP handlers
├── services/             # Business logic
├── guards/               # Authorization
├── dto/                  # Request/Response DTOs
├── entities/             # Domain entities (if needed)
├── {feature}.module.ts   # Module definition
└── index.ts              # Public exports
```

### Function Organization
- Input validation first (NestJS pipes/DTOs)
- Core logic in the middle
- Error handling via NestJS exception filters
- Early returns for edge cases

## Code Organization Principles

1. **Feature-First**: Modulos organizados por feature, nao por camada
2. **Vertical Slicing**: Cada feature contem controller + service + dto + tests
3. **Dependency Rule**: Packages nao dependem de apps, shared nao depende de database
4. **Contracts at Boundaries**: DTOs e interfaces nos limites entre modulos
5. **No Circular Dependencies**: Usar eventos do outbox para comunicacao entre modulos

## Module Boundaries

- **apps/api** → pode importar de `packages/*`
- **apps/web** → pode importar de `packages/shared`, `packages/ui`
- **apps/workers** → pode importar de `packages/database`, `packages/shared`, `packages/ai-gateway`
- **packages/database** → nao importa de outros packages
- **packages/shared** → nao importa de outros packages
- **packages/ai-gateway** → pode importar de `packages/shared`
- **packages/ui** → pode importar de `packages/shared`
- **packages/testing** → pode importar de `packages/database`

## Code Size Guidelines

- **File size**: Max 300 linhas
- **Function/Method size**: Max 30 linhas
- **Class complexity**: Max 10 metodos publicos
- **Nesting depth**: Max 3 niveis
- **Module size**: Max 15 arquivos por modulo
