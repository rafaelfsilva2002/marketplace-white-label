# CLAUDE.md — Marketplace White Label

## Projeto
Plataforma SaaS white-label de marketplace AI-Native multi-tenant.
Path: `C:/Users/manod/Downloads/marketplace white label`

## Stack
- **Backend**: NestJS (Fastify adapter) + Drizzle ORM
- **Frontend**: Next.js 14 (App Router, RSC, Tailwind)
- **DB**: PostgreSQL 16 + pgvector
- **Cache/Filas**: Redis + BullMQ
- **Monorepo**: Turborepo + pnpm
- **AI**: AI Gateway multi-provider (OpenAI, Anthropic, Ollama)
- **Pagamentos**: Stripe Connect
- **Busca**: Algolia

## Documentacao Obrigatoria
Antes de implementar qualquer coisa, LEIA estes arquivos:
1. `constitution.md` — Principios inviolaveis (11 artigos, 7 gates)
2. `docs/requirements.md` — 57 requisitos com criterios de aceitacao
3. `docs/trace-matrix.md` — Mapa requisito → ADR → task
4. `specs/pending/` — Specs de cada fase com tasks e dependencias
5. `docs/adr/` — 30 ADRs com decisoes, codigo e validacao
6. `.claude/steering/` — Contexto de produto, tecnologia e estrutura

## Regras de Implementacao

### Estrutura do Monorepo
```
marketplace-saas/
├── apps/web/          → Next.js 14
├── apps/api/          → NestJS
├── apps/workers/      → BullMQ jobs
├── packages/shared/   → Types, DTOs, events
├── packages/database/ → Drizzle schema, migrations, RLS
├── packages/ai-gateway/ → Router multi-provider
├── packages/testing/  → Factories, mocks, helpers
└── packages/ui/       → React components
```

### Convencoes
- Arquivos: `kebab-case` (ex: `tenant-resolver.guard.ts`)
- Classes: `PascalCase`
- Tabelas DB: `snake_case`, plural
- Eventos: `domain.entity.action` (ex: `marketplace.order.created`)
- Modulos: feature-first (vertical slicing)

### Obrigatorio em TODA implementacao
- `tenant_id` em toda query (RLS enforced)
- `correlationId` em todo log e evento
- Outbox pattern para publicar eventos (NUNCA publicar direto no broker)
- Chave de idempotencia em operacoes financeiras
- Testes de integracao com banco real (60% integracao, 30% unidade, 10% e2e)

### Proibido
- Queries sem `tenant_id` em tabelas de dominio
- Chamadas diretas a providers de IA fora do AI Gateway
- Camadas de abstracao sobre NestJS ou Drizzle
- Abstracoes antes da Rule of Three
- TypeORM (usamos Drizzle)
- tRPC (usamos REST + OpenAPI)
- Mocks de banco em testes de integracao (usar banco real)

## Workflow de Desenvolvimento
1. Ler a spec da task atual em `specs/pending/`
2. Ler os ADRs referenciados na trace-matrix
3. Escrever testes PRIMEIRO (TDD: Red → Green → Refactor)
4. Implementar seguindo o codigo de exemplo do ADR
5. Verificar que todos os criterios de aceitacao do requisito passam
6. Commitar com mensagem descritiva

## Superpowers (Skills Ativas)
- **TDD**: Sempre escrever testes antes do codigo
- **Brainstorming**: Antes de criar features, explorar requisitos e design
- **Systematic Debugging**: Diagnosticar antes de corrigir
- **Code Review**: Revisar apos cada chunk significativo
- **Verification**: Rodar verificacoes antes de declarar concluido
