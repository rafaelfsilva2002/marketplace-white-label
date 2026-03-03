# Structure Steering Document

## Monorepo Layout
```
marketplace-saas/
├── apps/
│   ├── web/           → Next.js 14 (App Router + RSC)
│   ├── api/           → NestJS (backend principal)
│   └── workers/       → BullMQ jobs (outbox, crypto, embeddings, agentes IA)
├── packages/
│   ├── shared/        → Types, DTOs, event schemas, constants
│   ├── database/      → Drizzle schema, migrations, RLS policies
│   ├── ai-gateway/    → Router multi-provider, metricas, cache, embeddings
│   ├── prompts/       → Templates de prompt versionados + testes
│   ├── semantic/      → Conceitos de negocio, value objects, state machines
│   ├── api-client/    → Client auto-gerado de OpenAPI (swagger)
│   ├── testing/       → Factories, mocks, helpers multi-tenant
│   └── ui/            → Componentes React (tenant-themed, AI widgets)
├── infra/
│   ├── docker/        → Docker Compose (PostgreSQL, Redis, Ollama opcional)
│   ├── rego/          → Politicas OPA (so Fase 3+)
│   └── github/        → CI/CD GitHub Actions
├── docs/              → ADRs, specs, plans
├── specs/             → Specs SDD (fases, tasks)
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Naming Conventions
| Elemento | Convencao | Exemplo |
|----------|-----------|---------|
| Arquivos | kebab-case | `tenant-resolver.guard.ts` |
| Diretorios | kebab-case | `ai-gateway/` |
| Classes | PascalCase | `TenantResolverGuard` |
| Interfaces | PascalCase com prefixo I | `ITenantRepository` |
| Funcoes/Metodos | camelCase | `resolveTenant()` |
| Tabelas DB | snake_case, plural | `provider_profiles` |
| Colunas DB | snake_case | `tenant_id`, `created_at` |
| Eventos | domain.entity.action | `marketplace.order.created` |
| Env vars | SCREAMING_SNAKE_CASE | `DATABASE_URL` |

## Module Organization (Feature-First)
```
apps/api/src/
├── modules/
│   ├── tenant/
│   │   ├── tenant.module.ts
│   │   ├── tenant.controller.ts
│   │   ├── tenant.service.ts
│   │   ├── tenant.repository.ts
│   │   ├── dto/
│   │   ├── guards/
│   │   └── __tests__/
│   ├── auth/
│   ├── provider/
│   ├── order/
│   └── billing/
├── common/
│   ├── interceptors/
│   ├── guards/
│   ├── decorators/
│   └── filters/
└── config/
```

## Testing Strategy
- **Integracao (60%)**: PostgreSQL real (testcontainers), Redis real, mocks so para servicos externos
- **Unidade (30%)**: Value objects, state machines, logica pura
- **E2E (10%)**: Fluxos criticos end-to-end
- **Contract tests**: Pact entre servicos internos e APIs publicas
- **Factories**: `packages/testing/` com helpers multi-tenant

## File Patterns
| Tipo | Pattern | Exemplo |
|------|---------|---------|
| Module | `*.module.ts` | `tenant.module.ts` |
| Controller | `*.controller.ts` | `tenant.controller.ts` |
| Service | `*.service.ts` | `tenant.service.ts` |
| Repository | `*.repository.ts` | `tenant.repository.ts` |
| DTO | `*.dto.ts` | `create-tenant.dto.ts` |
| Guard | `*.guard.ts` | `tenant-resolver.guard.ts` |
| Test | `*.spec.ts` / `*.test.ts` | `tenant.service.spec.ts` |
| Drizzle Schema | `*.schema.ts` | `tenant.schema.ts` |
| Migration | `NNNN_description.ts` | `0001_create_tenants.ts` |
| Event | `*.event.ts` | `order-created.event.ts` |
