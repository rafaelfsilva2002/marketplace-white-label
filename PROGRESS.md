# Progress — Marketplace AI-Native

## Fase 0 — Alicerce

### Concluido
- [x] 0.1 Setup monorepo (Turborepo + pnpm) — root config, workspaces, tsconfigs
- [x] 0.2 Docker Compose (PostgreSQL 16 + pgvector + Redis) — com init scripts
- [x] 0.3 NestJS API com Fastify + Drizzle ORM — bootstrap basico
- [x] 0.4 Next.js 14 com App Router + shadcn/ui — layout + tailwind + tema
- [x] 0.5 Schema base: users — Drizzle schema com user_role enum
- [x] Packages inicializados: shared, database, ai-gateway, ui, testing
- [x] Workers app scaffold com BullMQ

### Em Progresso
- [ ] 0.5+ Schema completo: profiles, reviews, payments, subscriptions, audit_log, outbox, AI tables
- [ ] 0.6 Auth: JWT + refresh token rotativo
- [ ] 0.7 RBAC: guards (admin, moderator, professional, user)
- [ ] 0.8 Rate limiter (per user, per operation)
- [ ] 0.9 Audit log (append-only)
- [ ] 0.10 Outbox pattern + event dispatcher
- [ ] 0.11 Envelope de eventos + validacao schema
- [ ] 0.12 CorrelationId em logs e eventos
- [ ] 0.13 Testes de integracao (banco real)

### Pendente
- Nenhum item pendente nesta fase

## Fase 1 — MVP Core
Status: Nao iniciada

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
