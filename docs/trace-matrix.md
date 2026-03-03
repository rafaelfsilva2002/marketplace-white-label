# Matriz de Rastreabilidade

> Mapeamento completo: **Requisito** --> **ADR(s)** --> **Task(s)** --> **Fase**
>
> - ADRs: `001` a `030` (ver `docs/adr/`)
> - Tasks: `task-0-*` (Fase 0), `task-1-*` (Fase 1), `task-2-*` (Fase 2), `task-3-*` (Fase 3), `task-4-*` (Fase 4)

---

## TEN -- Tenancy (Multi-tenant)

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| TEN-001 | ADR-001, ADR-012 | task-0-4, task-0-5 | Fase 0 |
| TEN-002 | ADR-001 | task-0-4, task-0-17 | Fase 0 |
| TEN-003 | ADR-001, ADR-012 | task-0-6 | Fase 0 |
| TEN-004 | ADR-002, ADR-015 | task-0-2, task-0-8 | Fase 0 |
| TEN-005 | ADR-001, ADR-002 | task-0-7, task-1-5, task-1-6, task-1-8 | Fase 1 |
| TEN-006 | ADR-007, ADR-012 | task-3-9 | Fase 3 |
| TEN-007 | ADR-001 | task-0-18 | Fase 0 |

---

## SEC -- Seguranca

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| SEC-001 | ADR-002, ADR-013 | task-0-9 | Fase 0 |
| SEC-002 | ADR-013, ADR-020 | task-0-10 | Fase 0 |
| SEC-003 | ADR-002, ADR-015 | task-0-11 | Fase 0 |
| SEC-004 | ADR-013 | task-0-12 | Fase 0 |
| SEC-005 | ADR-001, ADR-002, ADR-013 | task-0-5, task-0-10 | Fase 0 |
| SEC-006 | ADR-002 | task-0-1, task-0-16 | Fase 0 |

---

## FIN -- Financeiro

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| FIN-001 | ADR-003, ADR-009 | task-2-1, task-2-2, task-2-7 | Fase 2 |
| FIN-002 | ADR-003, ADR-009 | task-2-1, task-2-2 | Fase 2 |
| FIN-003 | ADR-003 | task-2-2, task-2-3, task-2-5 | Fase 2 |
| FIN-004 | ADR-003, ADR-018 | task-2-2, task-2-5, task-2-8 | Fase 2 |
| FIN-005 | ADR-003, ADR-009 | task-2-6 | Fase 2 |
| FIN-006 | ADR-008, ADR-009 | task-2-10 | Fase 2 |
| FIN-007 | ADR-003, ADR-014 | task-2-5, task-2-9 | Fase 2 |

---

## EVT -- Eventos

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| EVT-001 | ADR-005 | task-0-14 | Fase 0 |
| EVT-002 | ADR-005 | task-0-13 | Fase 0 |
| EVT-003 | ADR-005 | task-0-13 | Fase 0 |
| EVT-004 | ADR-005 | task-0-13, task-0-16 | Fase 0 |

---

## OBS -- Observabilidade

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| OBS-001 | ADR-013 | task-0-15 | Fase 0 |
| OBS-002 | ADR-001, ADR-013 | task-0-15 | Fase 0 |
| OBS-003 | ADR-017 | task-3-1, task-3-9 | Fase 3 |
| OBS-004 | ADR-011 | task-0-1, task-0-16 | Fase 0 |

---

## TRUST -- Confianca e Compliance

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| TRUST-001 | ADR-013 | task-3-3 | Fase 3 |
| TRUST-002 | ADR-013, ADR-021 | task-3-2 | Fase 3 |
| TRUST-003 | ADR-013, ADR-020 | task-3-7 | Fase 3 |
| TRUST-004 | ADR-010, ADR-008 | task-2-18 | Fase 2 |

---

## BIZ -- Negocio

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| BIZ-001 | ADR-001, ADR-016 | task-1-1, task-1-2 | Fase 1 |
| BIZ-002 | ADR-004 | task-1-3, task-1-4 | Fase 1 |
| BIZ-003 | ADR-002, ADR-015 | task-1-5, task-1-6, task-1-7 | Fase 1 |
| BIZ-004 | ADR-013 | task-1-9 | Fase 1 |
| BIZ-005 | ADR-003, ADR-009 | task-2-4, task-2-7, task-2-8 | Fase 2 |

---

## ORC -- Orquestracao

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| ORC-001 | ADR-018 | task-3-5 | Fase 3 |
| ORC-002 | ADR-018 | task-3-5 | Fase 3 |
| ORC-003 | ADR-018 | task-3-5 | Fase 3 |

---

## MGT -- Gestao Enterprise

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| MGT-001 | ADR-020 | task-3-6 | Fase 3 |
| MGT-002 | ADR-020, ADR-013 | task-3-7 | Fase 3 |
| MGT-003 | ADR-002, ADR-020 | task-1-5, task-1-6 | Fase 1 |
| MGT-004 | ADR-014, ADR-017 | task-3-1, task-3-4 | Fase 3 |

---

## DAT -- Dados

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| DAT-001 | ADR-016, ADR-006 | task-3-3 | Fase 3 |
| DAT-002 | ADR-022 | task-3-8 | Fase 3 |
| DAT-003 | ADR-019 | task-3-3 | Fase 3 |

---

## AI -- Inteligencia Artificial (AI-Native)

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| AI-001 | ADR-021, ADR-024 | task-2-21, task-2-22 | Fase 2 |
| AI-002 | ADR-005, ADR-016, ADR-025 | task-2-23 | Fase 2 |
| AI-003 | ADR-024 | task-2-22 | Fase 2 |
| AI-004 | ADR-014, ADR-017, ADR-026 | task-2-24 | Fase 2 |
| AI-005 | ADR-026 | task-3-11 | Fase 3 |
| AI-006 | ADR-027 | task-4-1 | Fase 4 |
| AI-007 | ADR-018, ADR-028 | task-3-12 | Fase 3 |
| AI-008 | ADR-028, ADR-029 | task-4-2 | Fase 4 |
| AI-009 | ADR-029, ADR-030 | task-4-3 | Fase 4 |
| AI-010 | ADR-021, ADR-024 | task-2-21 | Fase 2 |

---

## NFR -- Nao-Funcionais

| Requisito | ADR(s) Relacionado(s) | Task(s) de Implementacao | Fase |
|-----------|----------------------|--------------------------|------|
| NFR-001 | -- | task-0-16, task-1-10, task-2-12, task-2-20 | Fase 0 |
| NFR-002 | ADR-015, ADR-012 | task-0-8, task-0-16 | Fase 0 |
| NFR-003 | ADR-011, ADR-015 | task-3-10 | Fase 3 |
| NFR-004 | ADR-011 | task-3-10 | Fase 3 |
| NFR-005 | ADR-023 | task-3-10 | Fase 3 |

---

## Matriz Inversa: ADR --> Requisitos

A tabela abaixo permite identificar rapidamente quais requisitos cada ADR fundamenta.

| ADR | Titulo | Requisitos Fundamentados |
|-----|--------|--------------------------|
| ADR-001 | Modelo de Isolamento de Dados Multi-tenancy | TEN-001, TEN-002, TEN-003, TEN-005, TEN-007, SEC-005, OBS-002, BIZ-001 |
| ADR-002 | Host Trust Boundary e Resolucao de Tenant | TEN-004, TEN-005, SEC-001, SEC-003, SEC-005, SEC-006, BIZ-003, MGT-003 |
| ADR-003 | Idempotencia e Consistencia no Stripe Connect | FIN-001, FIN-002, FIN-003, FIN-004, FIN-005, FIN-007, BIZ-005 |
| ADR-004 | Isolamento de Dados no Algolia (Busca) | BIZ-002 |
| ADR-005 | Outbox Pattern e Replay de Eventos | EVT-001, EVT-002, EVT-003, EVT-004 |
| ADR-006 | Arquitetura Hub-and-Spoke para IA Multi-tenant | DAT-001 |
| ADR-007 | Suporte a Single-tenant para Compliance | TEN-006 |
| ADR-008 | Adapter para Multiplas Blockchains | FIN-006, TRUST-004 |
| ADR-009 | Conciliacao de Transacoes Cripto com Ledger | FIN-001, FIN-002, FIN-005, FIN-006, BIZ-005 |
| ADR-010 | Camada de Compliance e AML para Cripto | TRUST-004 |
| ADR-011 | GitOps com OCI Artifacts (Flux D2) | OBS-004, NFR-003, NFR-004 |
| ADR-012 | Proxy de Validacao Multi-tenant com PgDog | TEN-001, TEN-003, TEN-006, NFR-002 |
| ADR-013 | Trust Infrastructure como Camada Fundamental | SEC-001, SEC-002, SEC-004, SEC-005, OBS-001, OBS-002, TRUST-001, TRUST-002, TRUST-003, BIZ-004, MGT-002 |
| ADR-014 | Pricing Baseado em Outcomes | FIN-007, MGT-004 |
| ADR-015 | Edge Computing para Aplicacoes Globais | TEN-004, SEC-003, BIZ-003, NFR-002, NFR-003 |
| ADR-016 | Escalabilidade de Busca Vetorial para IA | BIZ-001, DAT-001 |
| ADR-017 | FinOps como Principio Arquitetural | OBS-003, MGT-004 |
| ADR-018 | Camada de Orquestracao como Ativo Estrategico | FIN-004, ORC-001, ORC-002, ORC-003 |
| ADR-019 | Camada Semantica Compartilhada | DAT-003 |
| ADR-020 | APIs de Gerenciamento para Clientes Enterprise | SEC-002, TRUST-003, MGT-001, MGT-002, MGT-003 |
| ADR-021 | Governanca de Shadow AI | TRUST-002 |
| ADR-022 | Active Backups para Reuso de Dados | DAT-002 |
| ADR-023 | Estrategia de API Versionamento | NFR-005 |
| ADR-024 | AI Gateway — Roteamento Inteligente Multi-Provider | AI-001, AI-003, AI-004, AI-010 |
| ADR-025 | Embeddings como Primeira Classe com Sync Automatico | AI-002 |
| ADR-026 | Observabilidade de IA — Metricas de Qualidade | AI-004, AI-005 |
| ADR-027 | A/B Testing de LLMs em Producao | AI-006 |
| ADR-028 | Runtime de Agentes com Gestao de Estado | AI-007, AI-008 |
| ADR-029 | Decision Delegation — Autonomia Gradual | AI-008, AI-009 |
| ADR-030 | Self-Optimizing Policies via Feedback Loop | AI-009 |

---

## Matriz Inversa: Task --> Requisitos

A tabela abaixo permite identificar quais requisitos cada task implementa.

### Fase 0 -- Alicerce

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-0-1 | Estrutura base NestJS com TypeORM e PostgreSQL | SEC-006, OBS-004 |
| task-0-2 | TenantInterceptor: extrai tenant do Host | TEN-004 |
| task-0-3 | TenantContext com AsyncLocalStorage | TEN-001 (dependencia) |
| task-0-4 | Coluna tenant_id em todas as tabelas | TEN-001, TEN-002 |
| task-0-5 | Repositorio base com filtro automatico de tenant | TEN-001, SEC-005 |
| task-0-6 | RLS no PostgreSQL e politicas por tabela | TEN-003 |
| task-0-7 | Tabela tenants e tenant_config (JSONB) | TEN-005 |
| task-0-8 | Cache Redis para resolucao de tenant | TEN-004, NFR-002 |
| task-0-9 | AuthModule: JWT, refresh token, revogacao | SEC-001 |
| task-0-10 | RBAC com roles e guards | SEC-002, SEC-005 |
| task-0-11 | Rate Limiter middleware | SEC-003 |
| task-0-12 | Audit Log (tabela append-only) | SEC-004 |
| task-0-13 | Tabela outbox e dispatcher | EVT-002, EVT-003, EVT-004 |
| task-0-14 | Envelope padrao de eventos e validacao de schema | EVT-001 |
| task-0-15 | CorrelationId em logger e tracing | OBS-001, OBS-002 |
| task-0-16 | Testes de integracao para Fase 0 | SEC-006, OBS-004, EVT-004, NFR-001, NFR-002 |
| task-0-17 | PKs compostas com tenant_id em todas as tabelas | TEN-002 |
| task-0-18 | Tabelas de referencia compartilhadas | TEN-007 |

### Fase 1 -- MVP

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-1-1 | Entidade Profile (com localizacao e servicos) | BIZ-001, TEN-002 |
| task-1-2 | Endpoints CRUD de Profile | BIZ-001 |
| task-1-3 | Integracao Algolia: indices por tenant | BIZ-002 |
| task-1-4 | Busca via Algolia com secured API keys | BIZ-002 |
| task-1-5 | TenantConfigModule: admin API | TEN-005, MGT-003 |
| task-1-6 | Endpoint publico de tenant config | TEN-005, BIZ-003, MGT-003 |
| task-1-7 | Frontend Next.js: hook useTenant() e tema | BIZ-003 |
| task-1-8 | Feature flags no frontend | TEN-005 |
| task-1-9 | Verificacao de perfil via painel admin | BIZ-004 |
| task-1-10 | Testes de integracao e seguranca para Fase 1 | NFR-001 |

### Fase 2 -- Monetizacao

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-2-1 | Entidade ledger_entry | FIN-001, FIN-002 |
| task-2-2 | Servico de ledger com validacao e idempotencia | FIN-001, FIN-002, FIN-003, FIN-004 |
| task-2-3 | Tabela stripe_webhook_events para deduplicacao | FIN-003 |
| task-2-4 | Stripe Connect: onboarding de profissionais | BIZ-005 |
| task-2-5 | Endpoint create-payment-intent | FIN-003, FIN-004, FIN-007 |
| task-2-6 | Webhook handler para pagamentos e reembolsos | FIN-005 |
| task-2-7 | Wallet do usuario (saldo agregado via ledger) | FIN-001, BIZ-005 |
| task-2-8 | Saques para profissionais via Stripe | FIN-004, BIZ-005 |
| task-2-9 | Dashboard financeiro para parceiro | FIN-007 |
| task-2-10 | Suporte a multiplas moedas | FIN-006 |
| task-2-11 | Rail cripto (registro e conciliacao simulada) | FIN-006 |
| task-2-12 | Testes de estresse para fluxos financeiros | NFR-001 |
| task-2-13 | Adaptador base para blockchain (interface CryptoRail) | FIN-006 |
| task-2-14 | Adaptador Ethereum/Polygon | FIN-006 |
| task-2-15 | Adaptador Solana | FIN-006 |
| task-2-16 | Tabela crypto_transactions e worker de reconciliacao | FIN-006, TRUST-004 |
| task-2-17 | Endpoints para deposito cripto | FIN-006 |
| task-2-18 | Camada de compliance AML | TRUST-004 |
| task-2-19 | Webhooks para notificacoes de transacoes | FIN-006 |
| task-2-20 | Testes de integracao para fluxo completo de cripto | NFR-001 |

### Fase 2 (cont.) -- Tasks AI-Native

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-2-21 | AI Gateway: router multi-provider + PII sanitizer | AI-001, AI-010 |
| task-2-22 | AI Gateway: cache semantico + circuit breaker | AI-001, AI-003 |
| task-2-23 | Embedding Sync Worker via outbox events | AI-002 |
| task-2-24 | AI Metering: custo por tenant por operacao | AI-004 |

### Fase 3 -- Enterprise

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-3-1 | Servico de metering e billing baseado em consumo | MGT-004, OBS-003 |
| task-3-2 | Integracao OPA para politicas de autorizacao | TRUST-002 |
| task-3-3 | Lineage de dados (tabela data_lineage + eventos) | TRUST-001, DAT-001, DAT-003 |
| task-3-4 | Rastreamento de outcomes para pricing por resultado | MGT-004 |
| task-3-5 | Camada de orquestracao com Temporal/Step Functions | ORC-001, ORC-002, ORC-003 |
| task-3-6 | APIs SCIM para provisionamento de usuarios | MGT-001 |
| task-3-7 | APIs de auditoria e logs para SIEM | TRUST-003, MGT-002 |
| task-3-8 | Backup searchavel (active backups) | DAT-002 |
| task-3-9 | Tagging e cost allocation para FinOps | OBS-003, TEN-006 |
| task-3-10 | GitOps com OCI Artifacts (Flux D2) | NFR-003, NFR-004, NFR-005 |

### Fase 3 (cont.) -- Tasks AI-Native Enterprise

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-3-11 | AI Quality Metrics: feedback loop + hallucination detection | AI-005 |
| task-3-12 | Agent Runtime com estado persistido + human-in-the-loop | AI-007 |

### Fase 4 -- AI-Native Completo

| Task | Titulo | Requisitos Implementados |
|------|--------|--------------------------|
| task-4-1 | A/B Testing de LLMs: router por variante + metricas | AI-006 |
| task-4-2 | Decision Delegation: 3 niveis de autonomia | AI-008 |
| task-4-3 | Self-Optimizing Policies: feedback loop + OPA pipeline | AI-009 |

---

## Cobertura: Requisitos sem Task Direta

Os seguintes requisitos sao transversais e sao implementados como praticas continuas, nao como tasks isoladas:

| Requisito | Justificativa |
|-----------|--------------|
| SEC-005 | Implementado como padrao no repositorio base (task-0-5) e guards (task-0-10). Validado em testes de cada fase. |
| SEC-006 | Implementado como configuracao global (ValidationPipe) na task-0-1. Validado em testes de cada fase. |
| EVT-003 | Configuracao de retry no dispatcher criado na task-0-13. |
| OBS-004 | Health checks configurados na estrutura base (task-0-1) e validados em testes (task-0-16). |

---

## Estatisticas de Cobertura

| Metrica | Valor |
|---------|-------|
| Total de Requisitos | 57 |
| Requisitos com ao menos 1 ADR | 56 (98.2%) |
| Requisitos com ao menos 1 Task | 57 (100%) |
| ADRs referenciados | 30/30 (100%) |
| Tasks referenciadas | 67/67 (100%) |
