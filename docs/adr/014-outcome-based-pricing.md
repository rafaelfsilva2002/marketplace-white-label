# ADR 014: Pricing Baseado em Outcomes (Service-as-Software)

## Status

**Aceito** — Março 2026

## Contexto

O modelo tradicional de precificação SaaS baseado em assinaturas fixas (por seat ou por tier) não captura o valor real entregue por uma plataforma marketplace. Clientes enterprise exigem alinhamento entre o custo do software e os resultados de negócio obtidos — transações processadas, matches realizados, receita gerada. Esse modelo é conhecido como "Service-as-Software" e representa a evolução natural de plataformas que atuam como infraestrutura de negócio.

No contexto multi-tenant, cada cliente (tenant) pode ter um contrato com métricas de outcome distintas. Um marketplace de serviços profissionais pode cobrar por match bem-sucedido, enquanto um marketplace de produtos pode cobrar percentual sobre GMV. A plataforma precisa suportar essa flexibilidade sem duplicação de lógica de billing.

A ausência de um sistema de metering robusto e auditável gera disputas de cobrança, perda de receita e erosão de confiança. O metering precisa ser tão confiável quanto o sistema financeiro — com rastreabilidade completa e reconciliação automática.

## Decisão

Implementamos um **sistema de pricing baseado em outcomes** com os seguintes componentes:

### 1. Metering Service

Serviço dedicado que captura e agrega eventos de negócio mensuráveis:

```typescript
interface MeterableEvent {
  tenantId: string;
  eventType: OutcomeType;    // TRANSACTION_PROCESSED, MATCH_MADE, REVENUE_GENERATED
  entityId: string;
  value: number;             // valor monetário ou contagem
  currency?: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  idempotencyKey: string;    // previne contagem duplicada
}

enum OutcomeType {
  TRANSACTION_PROCESSED = 'TRANSACTION_PROCESSED',
  MATCH_MADE = 'MATCH_MADE',
  REVENUE_GENERATED = 'REVENUE_GENERATED',
  ACTIVE_LISTING = 'ACTIVE_LISTING',
  API_CALL = 'API_CALL',
  SEARCH_QUERY = 'SEARCH_QUERY',
}
```

### 2. Contrato Configurável por Tenant

```sql
CREATE TABLE pricing_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(200) NOT NULL,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pricing_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES pricing_contracts(id),
    outcome_type    VARCHAR(50) NOT NULL,
    pricing_model   VARCHAR(30) NOT NULL, -- PERCENTAGE, PER_UNIT, TIERED, FLAT
    base_rate       NUMERIC(10, 4),
    tiers           JSONB,               -- para modelo tiered
    minimum_charge  NUMERIC(10, 2),
    cap             NUMERIC(10, 2),       -- teto mensal
    currency        VARCHAR(3) DEFAULT 'BRL'
);
```

### 3. Pipeline de Billing

1. Metering Service coleta eventos em tempo real via message queue (Redis Streams).
2. Agregação horária consolida eventos por tenant, tipo e período.
3. No fechamento do período (mensal), o Billing Engine aplica as regras do contrato.
4. Invoice gerada e reconciliada com Stripe Connect (ADR 003).
5. Audit trail completo vinculado ao Trust Infrastructure (ADR 013).

### 4. Modelo Tiered (Exemplo)

```json
{
  "outcome_type": "TRANSACTION_PROCESSED",
  "pricing_model": "TIERED",
  "tiers": [
    { "from": 0, "to": 1000, "rate": 0.029 },
    { "from": 1001, "to": 10000, "rate": 0.025 },
    { "from": 10001, "to": null, "rate": 0.019 }
  ],
  "minimum_charge": 99.00,
  "currency": "BRL"
}
```

## Consequências

### Positivas
- Alinhamento direto entre valor entregue e receita — clientes pagam pelo que usam.
- Flexibilidade contratual: cada tenant pode ter regras de pricing personalizadas.
- Metering auditável elimina disputas de cobrança com evidências verificáveis.
- Escalabilidade de receita: conforme o tenant cresce, a receita da plataforma cresce proporcionalmente.
- Barreira de entrada reduzida — tenants começam com custo baixo e escalam organicamente.

### Negativas
- Previsibilidade de receita reduzida para o operador da plataforma (mitigado com minimum charges).
- Complexidade do metering: falhas na contagem impactam diretamente o faturamento.
- Necessidade de sistema de resolução de disputas robusto.
- Latência adicional no pipeline de eventos para garantir idempotência e consistência.

## Implementação

- **Redis Streams** como buffer de eventos de metering com consumer groups por tipo de outcome.
- **Worker de agregação** executa a cada hora, consolidando contagens no PostgreSQL.
- **Billing Engine** como job agendado (cron ou Temporal workflow) no fechamento do período.
- **Idempotency** via `idempotencyKey` com deduplicação em janela de 24h no Redis.
- **Dashboard tenant** exibe consumo em tempo real com projeção de custo mensal.

## Validação

- Testes unitários para cada `pricing_model` (PERCENTAGE, PER_UNIT, TIERED, FLAT) com edge cases.
- Testes de integração simulam ciclo completo: evento -> metering -> agregação -> invoice.
- Teste de reconciliação compara totais do metering com totais do Stripe.
- Teste de idempotência envia eventos duplicados e verifica contagem única.
- Teste de carga com 100k eventos/minuto para validar throughput do metering.

## Emenda v1.1 — Cost-per-AI-Operation (Março 2026)

Com a adoção da arquitetura AI-Native, operações de IA passam a ser um tipo de outcome mensurável e cobrável por tenant.

### Novo OutcomeType para IA

```typescript
enum OutcomeType {
  TRANSACTION_PROCESSED = 'TRANSACTION_PROCESSED',
  MATCH_MADE = 'MATCH_MADE',
  REVENUE_GENERATED = 'REVENUE_GENERATED',
  ACTIVE_LISTING = 'ACTIVE_LISTING',
  API_CALL = 'API_CALL',
  SEARCH_QUERY = 'SEARCH_QUERY',
  // NOVOS — AI-Native
  AI_COMPLETION = 'AI_COMPLETION',         // chamada a LLM via AI Gateway
  AI_EMBEDDING_GENERATED = 'AI_EMBEDDING_GENERATED', // embedding gerado
  AI_AGENT_EXECUTION = 'AI_AGENT_EXECUTION',         // execução de agente
  AI_DECISION_DELEGATED = 'AI_DECISION_DELEGATED',   // decisão delegada a agente
}
```

### Metering de IA

O AI Gateway (ADR-024) emite eventos de metering para cada operação:

```typescript
interface AiMeterableEvent extends MeterableEvent {
  eventType: 'AI_COMPLETION' | 'AI_EMBEDDING_GENERATED' | 'AI_AGENT_EXECUTION';
  metadata: {
    provider: string;      // 'openai', 'anthropic', 'ollama'
    model: string;         // 'gpt-4-turbo', 'claude-3-opus'
    inputTokens: number;
    outputTokens: number;
    costUsd: number;       // custo real do provider
    feature: string;       // 'search', 'matching', 'moderation'
  };
}
```

### Impacto no Contrato

Tenants podem ter regras de pricing para AI operations:

```json
{
  "outcome_type": "AI_COMPLETION",
  "pricing_model": "PER_UNIT",
  "base_rate": 0.002,
  "cap": 500.00,
  "currency": "USD"
}
```

## Referências

- ADR 003 — Stripe Idempotency
- ADR 009 — Crypto Reconciliation Ledger
- ADR 013 — Trust Infrastructure
- ADR 017 — FinOps como Princípio Arquitetural
- ADR 024 — AI Gateway Routing
- ADR 026 — Observabilidade de IA
- REQ-BIZ-002 — Requisitos de Modelo de Negócio
