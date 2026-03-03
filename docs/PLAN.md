# SDD Plan — Marketplace AI-Native

> **Projeto**: Marketplace de servicos profissionais (inspirado Fatal Model)
> **Stack**: NestJS + PostgreSQL + Drizzle + Next.js 14 + shadcn/ui + Redis + BullMQ
> **Foco**: MVP com IA nativa desde o dia 1

---

## Visao

Marketplace que conecta profissionais de servicos a clientes com inteligencia artificial
embutida em toda a experiencia — busca semantica, recomendacao, moderacao automatica,
deteccao de fraude e precificacao dinâmica.

## Diferenciais IA

| # | Feature | O que faz | Tecnologia |
|---|---------|-----------|-----------|
| 1 | **Busca Semantica** | Encontra profissionais por intencao, nao so palavras-chave | pgvector + embeddings |
| 2 | **Recomendacao Inteligente** | Recomenda perfis similares baseado em comportamento real | embeddings + collaborative filtering |
| 3 | **Moderacao de Fotos** | Detecta conteudo improprio ou duplicado antes da aprovacao | Vision API (OpenAI/Anthropic) |
| 4 | **Deteccao de Fraude** | Identifica perfis falsos por padroes de comportamento | ML anomaly detection |
| 5 | **Analise de Sentimento** | Extrai insights das avaliacoes dos clientes | NLP sentiment analysis |
| 6 | **Precificacao Dinamica** | Sugere melhor plano baseado em historico de visualizacoes | Analytics + ML |

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│              Next.js 14                  │
│         (App Router + shadcn/ui)         │
│         Server Components + RSC          │
└──────────────┬──────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────┐
│              NestJS API                  │
│         (Fastify adapter)                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │ Auth │ │Profile│ │Search│ │Payment │ │
│  └──────┘ └──────┘ └──────┘ └────────┘ │
│  ┌──────┐ ┌──────┐ ┌──────────────────┐ │
│  │Audit │ │Events│ │   AI Gateway     │ │
│  └──────┘ └──────┘ └──────────────────┘ │
└──────┬───────────────┬──────────────────┘
       │               │
┌──────▼──────┐ ┌──────▼──────┐
│ PostgreSQL  │ │    Redis    │
│ + pgvector  │ │  + BullMQ   │
└─────────────┘ └─────────────┘
```

### Monorepo
```
marketplace/
├── apps/
│   ├── web/           → Next.js 14 + shadcn/ui
│   ├── api/           → NestJS (Fastify)
│   └── workers/       → BullMQ jobs (embeddings, moderacao, fraude)
├── packages/
│   ├── database/      → Drizzle schema + migrations
│   ├── shared/        → Types, DTOs, event schemas
│   ├── ai-gateway/    → Router multi-provider IA
│   └── ui/            → shadcn/ui components
├── infra/
│   └── docker/        → Docker Compose (PostgreSQL, Redis)
└── docs/
    └── PLAN.md        → Este arquivo
```

---

## Fases

### Fase 0 — Alicerce (Semana 1-2)
Setup do projeto, auth, eventos, observabilidade.

| # | Task | Depende de |
|---|------|-----------|
| 0.1 | Setup monorepo (Turborepo + pnpm) | - |
| 0.2 | Docker Compose (PostgreSQL 16 + pgvector + Redis) | - |
| 0.3 | NestJS API com Fastify + Drizzle ORM | 0.1 |
| 0.4 | Next.js 14 com App Router + shadcn/ui | 0.1 |
| 0.5 | Schema base: users, profiles | 0.3 |
| 0.6 | Auth: JWT + refresh token rotativo | 0.5 |
| 0.7 | RBAC: guards (admin, moderator, professional, user) | 0.6 |
| 0.8 | Rate limiter (per user, per operation) | 0.6 |
| 0.9 | Audit log (append-only) | 0.5 |
| 0.10 | Outbox pattern + event dispatcher | 0.5 |
| 0.11 | Envelope de eventos + validacao schema | - |
| 0.12 | CorrelationId em logs e eventos | - |
| 0.13 | Testes de integracao (banco real) | todos |

### Fase 1 — MVP Core (Semana 3-5)
Perfis, busca, pagamentos basicos, UI.

| # | Task | Depende de |
|---|------|-----------|
| 1.1 | Entidade Profile (name, description, location, services, photos, isVerified) | fase-0 |
| 1.2 | CRUD de profiles (com upload de fotos) | 1.1 |
| 1.3 | Busca full-text (Algolia ou PostgreSQL FTS) | 1.1 |
| 1.4 | Busca por geolocalizacao (PostGIS) | 1.1 |
| 1.5 | Frontend: paginas de busca, perfil, cadastro com shadcn/ui | 1.2, 1.3 |
| 1.6 | Sistema de avaliacoes (ratings + reviews) | 1.2 |
| 1.7 | Verificacao de perfil por moderadores | 1.2 |
| 1.8 | Stripe Connect: onboarding de profissionais | fase-0 |
| 1.9 | Pagamento basico (PaymentIntent + webhook) | 1.8 |
| 1.10 | Wallet com saldo derivado de ledger | 1.9 |
| 1.11 | Saques para profissionais via Stripe Transfer | 1.10 |
| 1.12 | Planos de assinatura para profissionais | 1.8 |
| 1.13 | Testes de integracao | todos |

### Fase 2 — IA Nativa (Semana 6-8)
Diferenciais de IA que fazem o marketplace se destacar.

| # | Task | Depende de |
|---|------|-----------|
| 2.1 | AI Gateway: router multi-provider (OpenAI/Anthropic/Ollama) | fase-0 |
| 2.2 | PII sanitizer no AI Gateway | 2.1 |
| 2.3 | Embedding sync worker (profiles → pgvector via outbox events) | 2.1, fase-1 |
| 2.4 | Busca semantica: "quero alguem pra cortar cabelo estilo coreano" → perfis relevantes | 2.3 |
| 2.5 | Recomendacao inteligente: "quem viu X tambem viu Y" | 2.3 |
| 2.6 | Moderacao automatica de fotos (Vision API) | 2.1 |
| 2.7 | Deteccao de fraude: identificar perfis falsos por padroes | 2.1 |
| 2.8 | Analise de sentimento das avaliacoes | 2.1, 1.6 |
| 2.9 | Precificacao dinamica: sugerir plano ideal por profissional | 2.1, 1.12 |
| 2.10 | Cache semantico (pgvector, similaridade > 0.95) | 2.1 |
| 2.11 | Metricas de custo de IA por operacao | 2.1 |
| 2.12 | Testes de integracao | todos |

### Fase 3 — Escala (Semana 9+)
Crypto, compliance, orquestracao.

| # | Task | Depende de |
|---|------|-----------|
| 3.1 | Crypto rails: adaptadores Ethereum/Polygon/Solana | fase-1 |
| 3.2 | Compliance AML para transacoes cripto | 3.1 |
| 3.3 | Orquestracao com Temporal (workflows longos) | fase-0 |
| 3.4 | Agentes IA com estado persistido | fase-2 |
| 3.5 | A/B testing de modelos e prompts | fase-2 |
| 3.6 | Decision delegation (autonomia gradual) | 3.4 |

---

## Stack Detalhada

| Camada | Tecnologia | Por que |
|--------|-----------|---------|
| Frontend | Next.js 14 + shadcn/ui + Tailwind | SSR/SSG, componentes acessiveis, App Router |
| Backend | NestJS + Fastify | Modular, decorators, DI nativo, rapido |
| ORM | Drizzle | SQL-first, queries tipadas, zero abstracao |
| DB | PostgreSQL 16 + pgvector | Vetores pra IA, JSONB, extensivel |
| Cache | Redis | Rate limiting, cache, session |
| Filas | BullMQ | Jobs async (embeddings, moderacao, fraude) |
| IA | AI Gateway (OpenAI, Anthropic, Ollama) | Multi-provider, PII sanitizer, cache semantico |
| Pagamentos | Stripe Connect | Marketplace splits, onboarding |
| Monorepo | Turborepo + pnpm | Build rapido, workspaces |

## Regras de Implementacao

1. **TDD obrigatorio** — Red → Green → Refactor
2. **Banco real nos testes** — testcontainers ou PostgreSQL de teste
3. **Sem abstracoes sobre NestJS/Drizzle** — usar direto
4. **Rule of Three** — so abstrair na terceira repeticao
5. **CorrelationId em todo log** — rastreabilidade ponta a ponta
6. **Outbox pattern** — nunca publicar evento direto no broker
7. **AI Gateway** — toda chamada a LLM passa pelo gateway
8. **Idempotencia** — toda operacao financeira com chave unica

## Roles

| Role | Descricao |
|------|-----------|
| `admin` | Administrador da plataforma |
| `moderator` | Modera perfis, fotos, disputas |
| `professional` | Oferece servicos, gerencia perfil |
| `user` | Busca e contrata profissionais |
