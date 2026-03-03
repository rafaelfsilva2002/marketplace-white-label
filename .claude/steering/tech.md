# Technology Steering Document

## Stack Overview
| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Frontend | Next.js 14 (App Router, RSC, Tailwind) | SSR/SSG, RSC para performance, Tailwind para theming por tenant |
| Backend | NestJS (Fastify adapter) | Modular, decorators, DI nativo, ecossistema maduro |
| ORM | **Drizzle** | SQL-first, suporte superior a RLS e chaves primarias compostas |
| Auth/RBAC | JWT + CASL (Fases 0-2), OPA/Rego (Fase 3+) | CASL e JS-native sem servico extra; OPA para policies complexas |
| Database | PostgreSQL 16 + pgvector | RLS nativo, pgvector para embeddings, JSONB para config |
| Cache/Filas | Redis + BullMQ | Cache, rate limiting, filas de jobs, circuit breaker state |
| AI | AI Gateway multi-provider (OpenAI, Anthropic, Ollama) | Abstrai providers, cache semantico, metricas por tenant |
| Monorepo | Turborepo + pnpm | Build caching, strict dependencies, workspaces |
| API Types | OpenAPI 3.1 → auto-generated TypeScript client | Padrao industria, consumers externos, contract testing |
| Orchestration | BullMQ (Fases 0-2), Temporal (Fase 3+) | BullMQ simples no inicio; Temporal para workflows complexos |
| Deploy | Docker Compose (dev), GitHub Actions (CI/CD) | Dev local simples, GitOps com OCI artifacts em prod |

## Critical Technical Decisions
1. **Drizzle > TypeORM** — SQL-first, melhor para RLS e composite PKs
2. **REST + OpenAPI > tRPC** — Mais padrao para consumers externos, auto-generated clients
3. **CASL > OPA inicialmente** — JS-native, sem servico extra nas Fases 0-2
4. **pnpm > npm/yarn** — Mais rapido, strict dependency resolution
5. **Ollama opcional** — Profile no docker-compose, nao obrigatorio para dev

## Architecture Patterns
- **Multi-tenant**: RLS + composite PKs + tenant resolver via hostname
- **Events**: Outbox pattern, domain events, dead letter queue
- **Financial**: Immutable ledger, idempotency keys, compensating entries
- **AI**: AI Gateway (single access point), embedding sync via events, agent runtime with state
- **Security**: Zero trust, JWT rotation, BOLA prevention, audit log append-only
- **Deploy**: Hub-and-spoke, GitOps, edge computing, FinOps tagging

## Constraints
- Toda query DEVE incluir tenant_id (RLS enforced)
- Toda chamada a LLM DEVE passar pelo AI Gateway
- Toda operacao financeira DEVE ser idempotente
- Max 3 servicos core na Fase 0
- Rule of Three para abstracoes
- Testes: integracao (60%), unidade (30%), e2e (10%)

## Third-Party Integrations
| Servico | Uso | Fase |
|---------|-----|------|
| Stripe Connect | Pagamentos, marketplace splits | 1 |
| Algolia | Busca full-text por tenant | 1 |
| OpenAI | LLM provider primario | 2 |
| Anthropic | LLM provider secundario | 2 |
| Ollama | LLM local (dev/testing) | 2 |
| OPA | Policy engine (substitui CASL) | 3 |
| Temporal | Workflow orchestration | 3 |
