# Product Steering Document

## Vision
Plataforma white-label de marketplace SaaS multi-tenant AI-native que permite parceiros (tenants) lancarem seus proprios marketplaces customizados para profissionais de servicos. Inspirado no modelo Fatal Model, escalavel para qualquer vertical.

## Problem Statement
Criar e operar um marketplace de servicos profissionais exige investimento significativo em tecnologia, pagamentos, compliance e infraestrutura. Tenants precisam de uma plataforma pronta que permita personalizacao total (dominio, marca, regras de negocio) sem o custo de construir do zero.

## Target Users
| Persona | Descricao |
|---------|-----------|
| **Platform Admin** | Equipe que opera a plataforma SaaS, gerencia tenants e infraestrutura |
| **Tenant Admin** | Dono do marketplace vertical (ex: servicos de beleza, fitness, saude) |
| **Provider** | Profissional que oferece servicos no marketplace do tenant |
| **Customer** | Usuario final que busca e contrata servicos |

## Key Business Objectives
1. **Multi-tenant isolation** — Dados, pagamentos e configuracoes completamente isolados por tenant
2. **White-label completo** — Dominio customizado, marca, regras de negocio por tenant
3. **Monetizacao flexivel** — Outcome-based pricing, comissoes configuraveis, crypto rails
4. **AI-Native** — IA nao e feature; e capacidade arquitetural (gateway, agentes, embeddings, A/B testing)
5. **Compliance** — KYC, AML, auditoria imutavel, data lineage

## Success Metrics
- Tempo de onboarding de novo tenant < 24h
- Isolamento de dados: zero vazamentos cross-tenant
- Disponibilidade: 99.9% SLA
- Latencia p95 < 500ms para APIs sincronas
- Custo de IA rastreavel por tenant com margem positiva

## Core Features (by Phase)
- **Fase 0**: Tenant isolation, auth, CRUD basico, ledger imutavel
- **Fase 1**: Marketplace completo, busca (Algolia), pagamentos (Stripe Connect), embeddings
- **Fase 2**: Crypto rails, agentes IA basicos, cache semantico, outcome pricing
- **Fase 3**: Temporal orchestration, OPA policies, hub-and-spoke deploy, A/B testing LLMs
- **Fase 4**: Self-optimizing policies, decision delegation, narrative insights, agent runtime completo
