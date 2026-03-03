# Technology Stack

## Project Type
Marketplace web application full-stack com IA nativa. Monorepo com frontend, backend API, workers assincronos e pacotes compartilhados.

## Core Technologies

### Primary Language(s)
- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Node.js 20+ LTS
- **Package Manager**: pnpm 9+
- **Monorepo**: Turborepo

### Key Dependencies/Libraries

| Camada | Tecnologia | Versao | Proposito |
|--------|-----------|--------|-----------|
| Frontend | Next.js 14 | 14.x | SSR/SSG, App Router, RSC |
| UI Components | shadcn/ui | latest | Componentes acessiveis, Radix-based |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| Backend | NestJS | 10.x | Framework modular, DI nativo |
| HTTP Adapter | Fastify | 4.x | High-performance HTTP server |
| ORM | Drizzle ORM | latest | SQL-first, queries tipadas, zero abstracao |
| Database | PostgreSQL 16 | 16.x | JSONB, extensivel, pgvector |
| Vectors | pgvector | 0.7+ | Embeddings para busca semantica |
| Geolocation | PostGIS | 3.x | Busca por proximidade geografica |
| Cache | Redis | 7.x | Rate limiting, cache, session |
| Queues | BullMQ | 5.x | Jobs assincronos (embeddings, moderacao) |
| Payments | Stripe Connect | latest | Marketplace splits, onboarding |
| AI (OpenAI) | openai | latest | GPT-4, embeddings, vision |
| AI (Anthropic) | @anthropic-ai/sdk | latest | Claude models |
| Testing | Vitest | latest | Unit + integration tests |

### Application Architecture
- **Monorepo**: Turborepo com pnpm workspaces
- **Backend**: NestJS com modulos feature-first (vertical slicing)
- **Frontend**: Next.js App Router com Server Components por padrao
- **Workers**: BullMQ processors independentes
- **AI Gateway**: Pacote isolado multi-provider (OpenAI, Anthropic, Ollama)

### Data Storage
- **Primary storage**: PostgreSQL 16 com pgvector e PostGIS
- **Caching**: Redis para rate limiting, cache, sessions
- **File storage**: S3-compatible (fotos de perfis)
- **Data formats**: JSON (API), JSONB (PostgreSQL)

### External Integrations
- **Stripe Connect**: Pagamentos, onboarding, webhooks
- **OpenAI API**: Embeddings, completions, vision
- **Anthropic API**: Claude completions
- **Ollama**: Modelos locais (fallback/dev)
- **S3**: Upload de fotos

## Development Environment

### Build & Development Tools
- **Build System**: Turborepo (parallel builds)
- **Package Management**: pnpm workspaces
- **Development workflow**: Hot reload (Next.js), watch mode (NestJS)
- **Containerization**: Docker Compose (PostgreSQL, Redis)

### Code Quality Tools
- **Static Analysis**: ESLint + TypeScript strict
- **Formatting**: Prettier
- **Testing Framework**: Vitest (unit + integration com banco real)
- **API Documentation**: OpenAPI/Swagger (NestJS decorators)

### Version Control & Collaboration
- **VCS**: Git
- **Branching Strategy**: Feature branches + main
- **Commit Format**: `feat(modulo): descricao [fase-X task-Y]`

## Technical Requirements & Constraints

### Performance Requirements
- Busca semantica: < 500ms (p95)
- API REST: < 200ms (p95)
- Busca full-text: < 100ms (p95)
- Frontend LCP: < 2.5s

### Security & Compliance
- JWT + refresh token rotativo
- RBAC com guards (admin, moderator, professional, user)
- Rate limiting per user per operation
- PII sanitizer no AI Gateway
- Audit log append-only
- LGPD compliance (dados pessoais)

### Scalability & Reliability
- Outbox pattern para eventos (zero perda)
- Circuit breaker no AI Gateway
- Retry com exponential backoff nos workers
- Optimistic locking nas wallets
- Idempotencia em operacoes financeiras

## Technical Decisions & Rationale

### Decision Log
1. **Drizzle ORM (vs TypeORM/Prisma)**: SQL-first, zero abstracao, queries tipadas sem overhead
2. **Fastify (vs Express)**: 2-3x mais rapido, schema-based validation
3. **pgvector (vs Pinecone/Weaviate)**: Sem vendor lock-in, co-located com dados, transacoes ACID
4. **BullMQ (vs Kafka/RabbitMQ)**: Simplicidade para MVP, Redis ja disponivel
5. **shadcn/ui (vs Material/Chakra)**: Componentes copiados (sem dependencia), Radix-based, altamente customizaveis
6. **Monorepo Turborepo (vs Nx/Lerna)**: Simples, rapido, zero config

## Known Limitations
- **Ollama**: Apenas para desenvolvimento local, nao para producao
- **PostGIS**: Requer extensao no PostgreSQL (incluido no Docker)
- **pgvector**: Requer tuning de indices para datasets grandes (> 1M vetores)
