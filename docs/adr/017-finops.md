# ADR 017: FinOps como Princípio Arquitetural

## Status

**Aceito** — Março 2026

## Contexto

Em uma plataforma multi-tenant SaaS, o custo de infraestrutura é diretamente atribuível aos tenants que a consomem. Sem visibilidade granular de custos por tenant, é impossível determinar a rentabilidade de cada cliente, definir preços sustentáveis ou identificar tenants que consomem recursos desproporcionalmente. O modelo de pricing baseado em outcomes (ADR 014) exige que o custo de servir cada outcome seja conhecido.

A complexidade aumenta com a diversidade de serviços cloud utilizados: PostgreSQL (RDS), Redis (ElastiCache), Stripe fees, Algolia queries, API de IA para embeddings, edge computing bandwidth e armazenamento S3. Cada um desses serviços tem um modelo de cobrança distinto, e a alocação de custo por tenant requer tagging consistente e monitoramento contínuo.

Além disso, sem governança financeira, é comum que ambientes de staging e desenvolvimento acumulem recursos órfãos, instâncias superdimensionadas persistam por meses, e picos de uso de um tenant impactem o custo de toda a plataforma sem que ninguém perceba até a fatura mensal chegar.

## Decisão

Adotamos **FinOps como princípio arquitetural** integrado ao ciclo de vida de desenvolvimento e operação:

### 1. Tagging Obrigatório de Recursos

Todo recurso de infraestrutura deve ter as seguintes tags:

```yaml
# Terraform / IaC — tags obrigatórias
resource "aws_rds_instance" "tenant_db" {
  tags = {
    tenant_id   = var.tenant_id       # UUID do tenant (ou "shared")
    environment = var.environment      # production, staging, development
    service     = "marketplace-api"    # nome do serviço
    cost_center = var.cost_center      # centro de custo do time
    managed_by  = "terraform"          # provisionamento
  }
}
```

**Política**: Pull requests que criam recursos sem tags obrigatórias são bloqueados via OPA no pipeline de CI (integração com ADR 013).

### 2. Alocação de Custos por Tenant

```sql
CREATE TABLE cost_allocation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    period          DATE NOT NULL,          -- primeiro dia do mês
    service_type    VARCHAR(50) NOT NULL,   -- RDS, REDIS, ALGOLIA, AI_API, STRIPE, EDGE, S3
    usage_quantity  NUMERIC(15, 4) NOT NULL,
    usage_unit      VARCHAR(30) NOT NULL,   -- hours, queries, requests, bytes, transactions
    cost_usd        NUMERIC(12, 4) NOT NULL,
    source          VARCHAR(50) NOT NULL,   -- AWS_CUR, STRIPE_API, ALGOLIA_USAGE, MANUAL
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, period, service_type)
);
```

### 3. Pipeline de Cost Allocation

```
[AWS Cost & Usage Report] ---> [Cost Allocation Engine]
[Stripe Usage API]        ---> [     (diário)        ] ---> [cost_allocation table]
[Algolia Analytics API]   --->                         ---> [Dashboard Grafana]
[AI Gateway Metering]     --->                         ---> [Budget Alerts]
```

### 4. Budget Alerts por Tenant

```typescript
interface TenantBudget {
  tenantId: string;
  monthlyBudgetUsd: number;
  alertThresholds: number[];  // [0.5, 0.8, 0.9, 1.0] = 50%, 80%, 90%, 100%
  actions: {
    notify: string[];         // emails para notificação
    throttle?: boolean;       // reduzir rate limits ao atingir 100%
    hardCap?: boolean;        // bloquear ao atingir 120%
  };
}
```

### 5. Right-sizing Automático

O sistema analisa métricas de utilização e gera recomendações:

- CPU médio < 20% por 7 dias → recomendar downsize.
- Memória Redis < 30% utilizada → recomendar instância menor.
- Conexões de banco ociosas → recomendar redução de pool.

## Consequências

### Positivas
- Visibilidade completa de custo por tenant — base para decisões de pricing e rentabilidade.
- Detecção proativa de anomalias de custo antes que impactem o P&L.
- Right-sizing contínuo reduz desperdício de infraestrutura em 20-40%.
- Passthrough de custo para pricing permite margens previsíveis e sustentáveis.
- Tenants problemáticos (alto custo, baixa receita) identificados automaticamente.

### Negativas
- Complexidade de implementação: integração com múltiplas APIs de billing de provedores cloud.
- Alocação de custos compartilhados (banco shared, cache shared) requer heurísticas que podem ser imprecisas.
- Overhead operacional de manter dashboards e alertas atualizados.
- Resistência organizacional a disciplina de tagging (mitigada via enforcement no CI).

## Implementação

- **AWS Cost & Usage Report** habilitado com granularidade horária e tags customizadas.
- **Job diário** (Temporal workflow) consolida custos de todas as fontes na tabela `cost_allocation`.
- **Grafana Dashboard** com visualizações: custo por tenant, custo por serviço, tendência mensal, projeção.
- **Slack webhook** dispara alertas de budget em canais dedicados.
- **OPA policy** no pipeline de CI bloqueia recursos sem tags obrigatórias.
- **Relatório mensal** automatizado enviado a cada tenant enterprise via email.

## Validação

- Teste de integridade: soma dos custos alocados por tenant deve aproximar-se do custo total da fatura AWS (tolerância de 5%).
- Teste de tagging: scan periódico identifica recursos sem tags e gera tickets automaticamente.
- Teste de alertas: simular ultrapassagem de budget e verificar notificação em < 5 minutos.
- Teste de right-sizing: comparar recomendações com utilização real e medir economia efetiva.
- Auditoria trimestral de alocação de custos compartilhados para ajustar heurísticas.

## Referências

- ADR 013 — Trust Infrastructure
- ADR 014 — Pricing Baseado em Outcomes
- ADR 011 — GitOps OCI Artifacts
- REQ-OPS-001 — Requisitos de Operação e Custos
