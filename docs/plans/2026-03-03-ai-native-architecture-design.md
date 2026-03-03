# Design Doc: Arquitetura AI-Native para Marketplace SaaS

> **Data**: 2026-03-03
> **Status**: Aprovado
> **Autores**: Arquitetura

---

## 1. Contexto e Motivação

A plataforma marketplace white-label já possui uma base arquitetural sólida: multi-tenancy com RLS, ledger financeiro imutável, outbox pattern, e event-driven architecture (23 ADRs documentados). Porém, a camada de inteligência artificial é tratada como feature isolada, não como capacidade arquitetural.

### Diagnóstico Atual: 5/25 (Estágio Inicial)

| Dimensão | Pontuação | Situação Atual | Gap |
|----------|-----------|----------------|-----|
| Embeddings como primeira classe | 1/5 | Sem sync automático com eventos de domínio | Embeddings desatualizados, sync manual |
| Tarefas além de timeout HTTP | 2/5 | BullMQ para jobs simples, sem orchestration de agentes | Temporal só planejado para Fase 3 |
| Métricas de qualidade de IA | 1/5 | Apenas métricas técnicas (latência, uptime) | Sem hallucination rate, quality score |
| Cost-per-outcome de IA | 1/5 | Sem roteamento de modelos, sem metering de IA | Custo de IA invisível por tenant |
| A/B testing de LLMs | 0/5 | Nenhuma infraestrutura | Zero capacidade de comparação |

**Pontuação total: 5/25** — A plataforma é AI-enabled, não AI-native.

## 2. Visão: De AI-Enabled para AI-Native

AI-Native significa que a inteligência artificial é uma **propriedade arquitetural**, não um módulo opcional. Assim como multi-tenancy permeia toda decisão de design, a capacidade de IA deve permear dados, workflows e decisões.

### Definição Operacional

Uma plataforma é AI-Native quando:
1. **Dados nascem com representação vetorial** — embeddings são sincronizados automaticamente via eventos
2. **Workflows incluem decisões de agentes** — agentes participam de fluxos de negócio com estado persistido
3. **Custo de IA é rastreável por tenant** — metering de tokens integrado ao FinOps
4. **Modelos são testados em produção** — A/B testing de LLMs com métricas de qualidade
5. **Políticas se auto-otimizam** — feedback loops entre resultados e regras de negócio

## 3. Os 5 Primitives AI-Native

### Primitive 1: Automatic Ingestion (substitui Data Entry)

| Antes | Depois |
|-------|--------|
| Dados entram via forms, APIs, imports manuais | Agente de ingestão interpreta dados não-estruturados |
| Embeddings gerados sob demanda | Embeddings sincronizados automaticamente via eventos |
| Busca por keyword (Algolia) | Busca semântica + keyword (Algolia + pgvector) |

**Implementação**: Worker de embedding sync que escuta eventos do outbox (ADR-005) e gera embeddings via AI Gateway.

### Primitive 2: Agentic Workflows (substitui Workflow Builders)

| Antes | Depois |
|-------|--------|
| Fluxos determinísticos hardcoded | Agentes com estado que tomam decisões em fluxos |
| Compensação manual em falhas | Agentes com Saga + circuit breaker |
| Sem autonomia | Níveis de autonomia graduais (0→1→2) |

**Implementação**: Agent Runtime em `apps/workers/` com estado persistido em PostgreSQL, limites configuráveis por tenant.

### Primitive 3: Self-Optimizing Policies (substitui Business Logic)

| Antes | Depois |
|-------|--------|
| Regras de negócio estáticas em código | Policies que aprendem com feedback |
| CASL/OPA manual | OPA + feedback loop de resultados |
| Mesmo comportamento para todos | Policies otimizadas por tenant |

**Implementação**: Feedback collector que registra outcomes de decisões, analyzer que sugere ajustes, aplicação via OPA.

### Primitive 4: Decision Delegation (substitui Approvals)

| Antes | Depois |
|-------|--------|
| Humano aprova tudo | Agente decide com threshold adaptativo |
| Fila de aprovação cresce | Apenas exceções chegam ao humano |
| Sem learning | Threshold ajusta com base em histórico |

**Implementação**: Decision engine com 3 níveis de autonomia, threshold por tipo de decisão e por tenant.

### Primitive 5: Narrative Insights (substitui Dashboards)

| Antes | Depois |
|-------|--------|
| Dashboards com gráficos estáticos | IA analisa dados e gera narrativa |
| Usuário interpreta gráficos | IA destaca anomalias e recomendações |
| Relatórios manuais | Relatórios gerados automaticamente |

**Implementação**: Insight generator que analisa métricas do tenant e produz narrativas via AI Gateway.

## 4. AI Gateway: Evolução Incremental

O AI Gateway (já definido no ADR-021) é expandido para ser o coração da arquitetura AI-Native:

### Fase 0: Router Básico + Logging
- Roteamento para OpenAI/Anthropic/Ollama
- Logging de prompt/completion
- Circuit breaker por provider
- Feature flags por tenant

### Fase 1: Cache Semântico + Embedding Sync
- Cache de respostas por similaridade semântica (pgvector)
- Worker de embedding sync via eventos do outbox
- Metering básico de tokens por tenant

### Fase 2: Métricas de Custo por Tenant
- Cost-per-operation por tenant integrado ao FinOps
- Quality score por operação
- Dashboard de consumo de IA por tenant
- Rate limiting adaptativo por tenant

### Fase 3: Agent Runtime
- Runtime de agentes com estado persistido
- Temporal como orchestrator de agentic workflows
- Human-in-the-loop para ações destrutivas
- Decision delegation com níveis de autonomia

### Fase 4: A/B Testing + Self-Optimizing
- A/B testing de modelos e prompts em produção
- Roteamento inteligente baseado em custo/qualidade
- Feedback loops para self-optimizing policies
- Narrative insights automáticos

## 5. Impacto na Arquitetura Existente

### Componentes Novos
| Componente | Localização | Fase |
|-----------|-------------|------|
| AI Gateway (expandido) | `packages/ai-gateway/` | 0-4 |
| Embedding Sync Worker | `apps/workers/embedding-sync/` | 1 |
| Agent Runtime | `apps/workers/agent-runtime/` | 3 |
| Decision Engine | `packages/semantic/decisions/` | 3 |
| Insight Generator | `apps/workers/insights/` | 4 |

### ADRs Impactados
| ADR | Mudança |
|-----|---------|
| ADR-005 (Outbox) | Novos event types para embedding sync |
| ADR-014 (Outcome Pricing) | OutcomeType.AI_OPERATION para custo de IA |
| ADR-016 (Vector DB) | Sync automático via eventos, não batch |
| ADR-018 (Orchestration) | Agent runtime como workload do Temporal |
| ADR-021 (Shadow AI) | Expandido para AI Gateway completo |

### ADRs Novos
| ADR | Tema |
|-----|------|
| ADR-024 | AI Gateway — Roteamento Inteligente Multi-Provider |
| ADR-025 | Embeddings como Primeira Classe com Sync Automático |
| ADR-026 | Observabilidade de IA — Métricas de Qualidade |
| ADR-027 | A/B Testing de LLMs em Produção |
| ADR-028 | Runtime de Agentes com Gestão de Estado |
| ADR-029 | Decision Delegation — Autonomia Gradual |
| ADR-030 | Self-Optimizing Policies via Feedback Loop |

## 6. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Custo de IA explode | Alta | Alto | Rate limiting por tenant, cost caps, model routing por custo |
| Alucinação em decisões críticas | Média | Crítico | Human-in-the-loop obrigatório para ações financeiras e destrutivas |
| Lock-in em provider de IA | Média | Médio | AI Gateway abstrai providers, Ollama como fallback local |
| Complexidade de agentes | Alta | Médio | Níveis de autonomia graduais, circuit breaker, limites de iteração |
| Embeddings desatualizados | Baixa | Alto | Sync automático via eventos, SLO < 60s, alertas |
| Dados de tenant em providers de IA | Alta | Crítico | PII sanitizer no AI Gateway, Ollama para dados sensíveis |

## 7. Métricas de Sucesso

| Métrica | Baseline (hoje) | Target (Fase 4) |
|---------|-----------------|-----------------|
| Pontuação AI-Native | 5/25 | 20/25 |
| Embedding sync latency | N/A (manual) | p95 < 60s |
| Custo de IA rastreável por tenant | 0% | 100% |
| Decisões delegadas a agentes | 0% | 30% das decisões operacionais |
| A/B tests de LLM simultâneos | 0 | 3+ |

## 8. Cronograma

| Fase | Escopo | Dependências |
|------|--------|-------------|
| Fase 0 | AI Gateway básico | Infraestrutura base (Fase 0 do projeto) |
| Fase 1 | Cache semântico + embedding sync | Outbox operacional, pgvector configurado |
| Fase 2 | Metering de IA + FinOps | Metering service (ADR-014), Redis Streams |
| Fase 3 | Agent runtime + decision engine | Temporal operacional (ADR-018), OPA |
| Fase 4 | A/B testing + self-optimizing | Todas as fases anteriores |

---

> **"IA não é uma feature que você adiciona. É uma propriedade arquitetural que você projeta desde o início."**
