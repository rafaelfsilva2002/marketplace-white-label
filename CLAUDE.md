# CLAUDE.md — Marketplace AI-Native

## Projeto
Marketplace de servicos profissionais AI-Native, inspirado no Fatal Model.
Marketplace unico (sem multi-tenant, sem white-label).
Path: `C:/Users/manod/Downloads/marketplace white label`

## Plano
Leia `docs/PLAN.md` — contém todas as fases, tasks e diferenciais IA.

## Stack
- **Backend**: NestJS (Fastify adapter) + Drizzle ORM + TypeScript
- **Frontend**: Next.js 14 (App Router, RSC, Tailwind, shadcn/ui)
- **DB**: PostgreSQL 16 + pgvector
- **Cache/Filas**: Redis + BullMQ
- **Monorepo**: Turborepo + pnpm
- **AI**: AI Gateway multi-provider (OpenAI, Anthropic, Ollama)
- **Pagamentos**: Stripe Connect

## Estrutura do Monorepo
```
marketplace/
├── apps/web/           → Next.js 14 + shadcn/ui
├── apps/api/           → NestJS (Fastify)
├── apps/workers/       → BullMQ jobs (embeddings, moderacao, fraude)
├── packages/database/  → Drizzle schema + migrations
├── packages/shared/    → Types, DTOs, event schemas
├── packages/ai-gateway/ → Router multi-provider IA
├── packages/ui/        → shadcn/ui components
└── infra/docker/       → Docker Compose (PostgreSQL, Redis)
```

## Convencoes
- Arquivos: `kebab-case` (ex: `profile.service.ts`)
- Classes: `PascalCase`
- Tabelas DB: `snake_case`, plural
- Eventos: `domain.entity.action` (ex: `marketplace.profile.created`)
- Modulos: feature-first (vertical slicing)

## Regras
- **TDD**: Escrever testes PRIMEIRO (Red → Green → Refactor)
- **Banco real nos testes**: testcontainers ou PostgreSQL de teste
- **correlationId**: em todo log e evento
- **Outbox pattern**: NUNCA publicar evento direto no broker
- **Idempotencia**: toda operacao financeira com chave unica
- **AI Gateway**: toda chamada a LLM passa pelo gateway

## Proibido
- Chamadas diretas a providers de IA fora do AI Gateway
- Abstracoes sobre NestJS ou Drizzle (usar direto)
- Abstracoes antes da Rule of Three
- TypeORM (usamos Drizzle)
- tRPC (usamos REST + OpenAPI)
- Mocks de banco em testes de integracao

## Roles
- `admin` — Administrador da plataforma
- `moderator` — Modera perfis, fotos, disputas
- `professional` — Oferece servicos, gerencia perfil
- `user` — Busca e contrata profissionais

## Frontend
- shadcn/ui como base de componentes
- Tailwind CSS para estilizacao
- Server Components por padrao, Client Components apenas quando necessario
- App Router com layouts e loading states

## Diferenciais IA
1. Busca semantica (pgvector + embeddings)
2. Recomendacao inteligente (embeddings + collaborative filtering)
3. Moderacao automatica de fotos (Vision API)
4. Deteccao de fraude (anomaly detection)
5. Analise de sentimento das avaliacoes (NLP)
6. Precificacao dinamica (analytics + ML)
