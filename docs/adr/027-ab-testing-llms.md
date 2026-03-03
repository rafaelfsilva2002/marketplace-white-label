# ADR 027: A/B Testing de LLMs em Produção

## Status

**Aceito** — Março 2026

## Contexto

A plataforma utiliza modelos de linguagem (LLMs) em diversas features: busca semântica, matching, moderação de conteúdo, recomendações e assistentes conversacionais. A escolha do modelo, do prompt e dos parâmetros de inferência (temperatura, top_p, max_tokens) impacta diretamente três dimensões: custo, latência e qualidade do output.

Hoje, mudanças de modelo ou prompt são feitas via deploy e avaliadas subjetivamente. Não existe infraestrutura para comparar variantes de forma controlada em produção, com dados reais de cada tenant. Um modelo pode ser 40% mais barato, mas gerar outputs 15% piores em qualidade — sem A/B testing, essa trade-off é invisível.

No contexto multi-tenant, o problema é amplificado: um modelo pode performar melhor para marketplaces de serviços profissionais e pior para marketplaces de produtos físicos. A segmentação por tenant é essencial para decisões de roteamento inteligente.

Além disso, provedores de IA atualizam modelos sem aviso (ADR-021), e o A/B testing permite validar novas versões antes de promovê-las como padrão. A integração com o AI Gateway (ADR-024) garante que o roteamento de tráfego seja transparente para os serviços consumidores, e a Observabilidade de IA (ADR-026) fornece as métricas de qualidade necessárias para declarar um vencedor com significância estatística.

## Decisão

Implementamos uma **infraestrutura de A/B testing integrada ao AI Gateway** que permite comparar variantes de modelos e prompts em produção com coleta automática de métricas e rollback automático:

### 1. Modelo de Dados para Testes A/B

```sql
CREATE TABLE ab_tests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id),  -- NULL = global (todos os tenants)
    feature         VARCHAR(50) NOT NULL,          -- SEARCH, MATCHING, MODERATION, etc.
    name            VARCHAR(200) NOT NULL,
    hypothesis      TEXT NOT NULL,                  -- "Claude 3.5 Sonnet reduz custo em 30% sem perda de qualidade"
    status          VARCHAR(20) DEFAULT 'DRAFT',   -- DRAFT, RUNNING, PAUSED, CONCLUDED, ROLLED_BACK
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,
    min_sample_size INTEGER NOT NULL DEFAULT 1000,
    confidence_level NUMERIC(4, 3) DEFAULT 0.950,  -- 95% significância estatística
    primary_metric  VARCHAR(50) NOT NULL,           -- quality_score, latency_p50, cost_per_request
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    concluded_at    TIMESTAMPTZ,
    winner_variant_id UUID
);

CREATE TABLE ab_test_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id         UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,          -- "control", "challenger-claude-sonnet"
    is_control      BOOLEAN DEFAULT false,
    traffic_pct     INTEGER NOT NULL CHECK (traffic_pct BETWEEN 0 AND 100),
    model_provider  VARCHAR(50) NOT NULL,           -- OPENAI, ANTHROPIC, LOCAL
    model_id        VARCHAR(100) NOT NULL,          -- gpt-4-turbo, claude-3-5-sonnet, etc.
    prompt_template_id UUID,                        -- referência ao prompt versionado
    parameters      JSONB DEFAULT '{}',             -- temperature, top_p, max_tokens, etc.
    status          VARCHAR(20) DEFAULT 'ACTIVE',   -- ACTIVE, DISABLED, WINNER, LOSER
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ab_test_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id         UUID NOT NULL REFERENCES ab_tests(id),
    variant_id      UUID NOT NULL REFERENCES ab_test_variants(id),
    tenant_id       UUID NOT NULL,
    request_id      UUID NOT NULL,                  -- correlação com o request original
    feature         VARCHAR(50) NOT NULL,
    input_hash      VARCHAR(128),                   -- hash do input para reprodutibilidade
    output_quality_score NUMERIC(5, 4),             -- 0.0000 a 1.0000
    latency_ms      INTEGER NOT NULL,
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    cost            NUMERIC(10, 6) NOT NULL,
    error           BOOLEAN DEFAULT false,
    error_type      VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ab_assignments_test_variant ON ab_test_assignments(test_id, variant_id);
CREATE INDEX idx_ab_assignments_tenant ON ab_test_assignments(tenant_id, test_id);
CREATE INDEX idx_ab_tests_status ON ab_tests(status) WHERE status = 'RUNNING';
```

### 2. Router de A/B Testing

```typescript
// ai-gateway/src/ab-testing/ab-test-router.ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

interface AbTestVariant {
  id: string;
  name: string;
  isControl: boolean;
  trafficPct: number;
  modelProvider: string;
  modelId: string;
  promptTemplateId?: string;
  parameters: Record<string, unknown>;
}

interface AbTestConfig {
  id: string;
  feature: string;
  tenantId?: string;
  status: string;
  variants: AbTestVariant[];
}

interface RoutingDecision {
  testId: string;
  variant: AbTestVariant;
  assignmentId: string;
}

@Injectable()
export class AbTestRouter {
  constructor(
    private readonly abTestRepo: AbTestRepository,
    private readonly assignmentRepo: AbTestAssignmentRepository,
    private readonly cache: CacheService,
  ) {}

  async route(
    tenantId: string,
    feature: string,
    requestId: string,
  ): Promise<RoutingDecision | null> {
    // 1. Buscar testes ativos para este tenant/feature (com cache)
    const activeTests = await this.getActiveTests(tenantId, feature);
    if (activeTests.length === 0) return null;

    // 2. Usar o primeiro teste ativo (um teste por feature por vez)
    const test = activeTests[0];

    // 3. Selecionar variante via hashing determinístico
    const variant = this.selectVariant(test, tenantId, requestId);

    // 4. Registrar assignment
    const assignmentId = await this.assignmentRepo.create({
      testId: test.id,
      variantId: variant.id,
      tenantId,
      requestId,
      feature,
    });

    return { testId: test.id, variant, assignmentId };
  }

  private selectVariant(
    test: AbTestConfig,
    tenantId: string,
    requestId: string,
  ): AbTestVariant {
    // Hash determinístico: mesmo tenant+request sempre vai para mesma variante
    const hash = createHash('sha256')
      .update(`${test.id}:${tenantId}:${requestId}`)
      .digest();

    const bucket = hash.readUInt16BE(0) % 100; // 0-99

    let cumulative = 0;
    for (const variant of test.variants) {
      cumulative += variant.trafficPct;
      if (bucket < cumulative) {
        return variant;
      }
    }

    // Fallback: retornar controle
    return test.variants.find((v) => v.isControl) ?? test.variants[0];
  }

  private async getActiveTests(
    tenantId: string,
    feature: string,
  ): Promise<AbTestConfig[]> {
    const cacheKey = `ab-tests:${tenantId}:${feature}`;

    return this.cache.getOrSet(cacheKey, 60, async () => {
      // Buscar testes globais + específicos do tenant
      return this.abTestRepo.findActive(tenantId, feature);
    });
  }
}
```

### 3. Coletor de Métricas por Variante

```typescript
// ai-gateway/src/ab-testing/variant-metrics-collector.ts
import { Injectable } from '@nestjs/common';

interface VariantMetrics {
  variantId: string;
  sampleSize: number;
  avgCost: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  avgQualityScore: number;
  errorRate: number;
  totalCost: number;
}

interface VariantComparison {
  control: VariantMetrics;
  challenger: VariantMetrics;
  costDelta: number;        // percentual: positivo = challenger mais caro
  latencyDelta: number;     // percentual: positivo = challenger mais lento
  qualityDelta: number;     // percentual: positivo = challenger melhor
  pValue: number;           // significância estatística
  isSignificant: boolean;
}

@Injectable()
export class VariantMetricsCollector {
  constructor(
    private readonly assignmentRepo: AbTestAssignmentRepository,
    private readonly metricsStore: MetricsStore,
  ) {}

  async recordOutcome(
    assignmentId: string,
    outcome: {
      qualityScore: number;
      latencyMs: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      error?: boolean;
      errorType?: string;
    },
  ): Promise<void> {
    await this.assignmentRepo.updateOutcome(assignmentId, outcome);

    // Emitir métrica para Grafana/Prometheus
    await this.metricsStore.emit('ab_test_outcome', {
      assignmentId,
      ...outcome,
    });
  }

  async getVariantMetrics(
    testId: string,
    variantId: string,
  ): Promise<VariantMetrics> {
    const stats = await this.assignmentRepo.aggregateByVariant(testId, variantId);

    return {
      variantId,
      sampleSize: stats.count,
      avgCost: stats.avgCost,
      avgLatencyMs: stats.avgLatencyMs,
      p50LatencyMs: stats.p50LatencyMs,
      p99LatencyMs: stats.p99LatencyMs,
      avgQualityScore: stats.avgQualityScore,
      errorRate: stats.errorCount / stats.count,
      totalCost: stats.totalCost,
    };
  }

  async compareVariants(testId: string): Promise<VariantComparison> {
    const test = await this.assignmentRepo.getTest(testId);
    const controlVariant = test.variants.find((v) => v.isControl)!;
    const challengerVariant = test.variants.find((v) => !v.isControl)!;

    const control = await this.getVariantMetrics(testId, controlVariant.id);
    const challenger = await this.getVariantMetrics(testId, challengerVariant.id);

    const pValue = this.calculatePValue(control, challenger, test.primaryMetric);

    return {
      control,
      challenger,
      costDelta: ((challenger.avgCost - control.avgCost) / control.avgCost) * 100,
      latencyDelta: ((challenger.avgLatencyMs - control.avgLatencyMs) / control.avgLatencyMs) * 100,
      qualityDelta: ((challenger.avgQualityScore - control.avgQualityScore) / control.avgQualityScore) * 100,
      pValue,
      isSignificant: pValue < (1 - test.confidenceLevel),
    };
  }

  /**
   * Teste de Welch (t-test para amostras com variâncias desiguais).
   * Retorna p-value bilateral.
   */
  private calculatePValue(
    control: VariantMetrics,
    challenger: VariantMetrics,
    metric: string,
  ): number {
    const stats = this.assignmentRepo.getDistributionStats(
      control.variantId,
      challenger.variantId,
      metric,
    );

    const t = (stats.meanA - stats.meanB) /
      Math.sqrt(stats.varianceA / stats.nA + stats.varianceB / stats.nB);

    const df = this.welchDf(
      stats.varianceA, stats.nA,
      stats.varianceB, stats.nB,
    );

    return this.tDistributionPValue(Math.abs(t), df) * 2; // bilateral
  }

  private welchDf(v1: number, n1: number, v2: number, n2: number): number {
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    return num / den;
  }

  private tDistributionPValue(t: number, df: number): number {
    // Aproximação via distribuição t de Student (Abramowitz & Stegun)
    const x = df / (df + t * t);
    return 0.5 * this.incompleteBeta(df / 2, 0.5, x);
  }

  private incompleteBeta(a: number, b: number, x: number): number {
    // Implementação simplificada — em produção usar biblioteca estatística
    // como 'jstat' ou 'simple-statistics'
    throw new Error('Usar biblioteca jstat.ibeta(a, b, x) em produção');
  }
}
```

### 4. Engine de Decisão do A/B Test

```typescript
// ai-gateway/src/ab-testing/ab-test-decision-engine.ts
import { Injectable, Logger } from '@nestjs/common';

interface TestDecision {
  action: 'CONTINUE' | 'CONCLUDE_WINNER' | 'CONCLUDE_NO_WINNER' | 'ROLLBACK';
  reason: string;
  winnerId?: string;
  metrics: VariantComparison;
}

interface QualityGuardrail {
  metric: string;
  threshold: number;
  operator: 'LT' | 'GT';
}

@Injectable()
export class AbTestDecisionEngine {
  private readonly logger = new Logger(AbTestDecisionEngine.name);

  private readonly guardrails: QualityGuardrail[] = [
    { metric: 'errorRate', threshold: 0.10, operator: 'GT' },    // rollback se error rate > 10%
    { metric: 'avgQualityScore', threshold: 0.60, operator: 'LT' }, // rollback se qualidade < 0.6
    { metric: 'p99LatencyMs', threshold: 10000, operator: 'GT' },  // rollback se p99 > 10s
  ];

  constructor(
    private readonly metricsCollector: VariantMetricsCollector,
    private readonly abTestRepo: AbTestRepository,
    private readonly notifier: NotificationService,
  ) {}

  /**
   * Avaliação periódica (executada via cron a cada hora).
   * Analisa todos os testes em execução e toma decisões automáticas.
   */
  async evaluateAllRunningTests(): Promise<void> {
    const runningTests = await this.abTestRepo.findByStatus('RUNNING');

    for (const test of runningTests) {
      const decision = await this.evaluate(test.id);

      switch (decision.action) {
        case 'ROLLBACK':
          await this.executeRollback(test.id, decision);
          break;
        case 'CONCLUDE_WINNER':
          await this.concludeWithWinner(test.id, decision);
          break;
        case 'CONCLUDE_NO_WINNER':
          await this.concludeNoWinner(test.id, decision);
          break;
        case 'CONTINUE':
          this.logger.log(`Teste ${test.id}: continua coletando dados — ${decision.reason}`);
          break;
      }
    }
  }

  async evaluate(testId: string): Promise<TestDecision> {
    const test = await this.abTestRepo.findById(testId);
    const comparison = await this.metricsCollector.compareVariants(testId);

    // 1. Verificar guardrails de qualidade (rollback imediato)
    const guardrailViolation = this.checkGuardrails(comparison);
    if (guardrailViolation) {
      return {
        action: 'ROLLBACK',
        reason: guardrailViolation,
        metrics: comparison,
      };
    }

    // 2. Verificar se atingiu sample size mínimo
    if (
      comparison.control.sampleSize < test.minSampleSize ||
      comparison.challenger.sampleSize < test.minSampleSize
    ) {
      return {
        action: 'CONTINUE',
        reason: `Amostra insuficiente: control=${comparison.control.sampleSize}, challenger=${comparison.challenger.sampleSize}, mínimo=${test.minSampleSize}`,
        metrics: comparison,
      };
    }

    // 3. Verificar significância estatística
    if (!comparison.isSignificant) {
      // Verificar se já atingiu tempo máximo
      if (test.endDate && new Date() > new Date(test.endDate)) {
        return {
          action: 'CONCLUDE_NO_WINNER',
          reason: `Tempo máximo atingido sem significância estatística (p-value=${comparison.pValue.toFixed(4)})`,
          metrics: comparison,
        };
      }

      return {
        action: 'CONTINUE',
        reason: `Aguardando significância estatística (p-value=${comparison.pValue.toFixed(4)}, threshold=${1 - test.confidenceLevel})`,
        metrics: comparison,
      };
    }

    // 4. Declarar vencedor baseado na métrica primária
    const winner = this.determineWinner(comparison, test.primaryMetric);

    return {
      action: 'CONCLUDE_WINNER',
      reason: `Significância atingida (p-value=${comparison.pValue.toFixed(4)}). Vencedor: ${winner.variantId} com ${test.primaryMetric} superior.`,
      winnerId: winner.variantId,
      metrics: comparison,
    };
  }

  private checkGuardrails(comparison: VariantComparison): string | null {
    for (const guardrail of this.guardrails) {
      const challengerValue = comparison.challenger[guardrail.metric as keyof VariantMetrics] as number;

      if (guardrail.operator === 'GT' && challengerValue > guardrail.threshold) {
        return `Guardrail violado: challenger ${guardrail.metric}=${challengerValue} > ${guardrail.threshold}`;
      }
      if (guardrail.operator === 'LT' && challengerValue < guardrail.threshold) {
        return `Guardrail violado: challenger ${guardrail.metric}=${challengerValue} < ${guardrail.threshold}`;
      }
    }
    return null;
  }

  private determineWinner(
    comparison: VariantComparison,
    primaryMetric: string,
  ): VariantMetrics {
    const controlValue = comparison.control[primaryMetric as keyof VariantMetrics] as number;
    const challengerValue = comparison.challenger[primaryMetric as keyof VariantMetrics] as number;

    // Para custo e latência, menor é melhor; para qualidade, maior é melhor
    const lowerIsBetter = ['avgCost', 'avgLatencyMs', 'p50LatencyMs', 'p99LatencyMs', 'errorRate'];

    if (lowerIsBetter.includes(primaryMetric)) {
      return challengerValue < controlValue ? comparison.challenger : comparison.control;
    }
    return challengerValue > controlValue ? comparison.challenger : comparison.control;
  }

  private async executeRollback(testId: string, decision: TestDecision): Promise<void> {
    this.logger.warn(`ROLLBACK do teste ${testId}: ${decision.reason}`);

    await this.abTestRepo.updateStatus(testId, 'ROLLED_BACK');

    // Desabilitar variante challenger — todo tráfego volta para controle
    const test = await this.abTestRepo.findById(testId);
    const challenger = test.variants.find((v) => !v.isControl);
    if (challenger) {
      await this.abTestRepo.updateVariantStatus(challenger.id, 'DISABLED');
    }

    // Notificar equipe
    await this.notifier.send({
      channel: 'ai-ops',
      severity: 'HIGH',
      title: `A/B Test Rollback: ${test.name}`,
      body: decision.reason,
      metadata: { testId, metrics: decision.metrics },
    });
  }

  private async concludeWithWinner(testId: string, decision: TestDecision): Promise<void> {
    this.logger.log(`Teste ${testId} concluído com vencedor: ${decision.winnerId}`);

    await this.abTestRepo.updateStatus(testId, 'CONCLUDED');
    await this.abTestRepo.setWinner(testId, decision.winnerId!);

    await this.notifier.send({
      channel: 'ai-ops',
      severity: 'INFO',
      title: `A/B Test Concluído: vencedor declarado`,
      body: decision.reason,
      metadata: { testId, winnerId: decision.winnerId, metrics: decision.metrics },
    });
  }

  private async concludeNoWinner(testId: string, decision: TestDecision): Promise<void> {
    this.logger.log(`Teste ${testId} concluído sem vencedor: ${decision.reason}`);

    await this.abTestRepo.updateStatus(testId, 'CONCLUDED');

    await this.notifier.send({
      channel: 'ai-ops',
      severity: 'INFO',
      title: `A/B Test Concluído: sem diferença significativa`,
      body: decision.reason,
      metadata: { testId, metrics: decision.metrics },
    });
  }
}
```

### 5. Integração com AI Gateway

```
[Request] → [AI Gateway]
               ├── AbTestRouter.route(tenantId, feature, requestId)
               │     ├── Teste ativo? → Selecionar variante
               │     └── Sem teste? → Modelo padrão do tenant
               ├── Executar chamada com modelo/prompt da variante
               ├── VariantMetricsCollector.recordOutcome(...)
               └── [Response]

[Cron Horário] → AbTestDecisionEngine.evaluateAllRunningTests()
                   ├── Verificar guardrails → ROLLBACK se violado
                   ├── Verificar sample size → CONTINUE se insuficiente
                   ├── Calcular significância → CONCLUDE ou CONTINUE
                   └── Notificar equipe
```

## Consequências

### Positivas
- Decisões de modelo e prompt baseadas em dados reais de produção, não em benchmarks sintéticos.
- Segmentação por tenant permite descobrir que modelos diferentes são ótimos para verticais diferentes.
- Rollback automático via guardrails protege contra degradação de qualidade em produção.
- Significância estatística previne decisões prematuras baseadas em amostras pequenas.
- Transparência total: cada request é rastreável ao teste e variante que o serviu.
- Integração nativa com AI Gateway (ADR-024) — sem mudanças nos serviços consumidores.

### Negativas
- Complexidade adicional no AI Gateway para gerenciar roteamento de variantes.
- Custo de armazenamento: cada assignment gera um registro na tabela `ab_test_assignments`.
- Período de teste pode aumentar custos temporariamente (variante challenger pode ser mais cara).
- Risco de interação entre testes concorrentes se múltiplos testes rodarem na mesma feature (mitigado com regra de um teste por feature).
- Cálculo de significância estatística exige sample sizes grandes para detectar diferenças pequenas.

## Implementação

- **AbTestRouter** integrado ao AI Gateway como middleware, executado antes do model routing padrão.
- **Dashboard Grafana** com painéis de comparação de variantes em tempo real: custo, latência, qualidade.
- **Cron job** (via BullMQ) executa `AbTestDecisionEngine.evaluateAllRunningTests()` a cada hora.
- **API REST** para criar, pausar, retomar e concluir testes manualmente.
- **Particionamento** da tabela `ab_test_assignments` por mês para gerenciar volume.
- **Retenção**: assignments mais antigos que 90 dias são arquivados para cold storage.
- **Biblioteca estatística** `jstat` para cálculos de p-value e intervalos de confiança.

## Validação

- Teste de roteamento: verificar que o hash determinístico distribui tráfego conforme percentuais configurados.
- Teste de consistência: mesmo tenant + mesmo requestId sempre recebe a mesma variante.
- Teste de guardrail: simular variante com error rate > 10% e verificar rollback automático.
- Teste de significância: com dados sintéticos, verificar que o p-value converge corretamente.
- Teste de isolamento: teste em tenant específico não afeta roteamento de outros tenants.
- Teste de conclusão: atingir sample size mínimo e verificar que decisão é tomada corretamente.
- Teste de carga: 10.000 requests concorrentes com A/B testing ativo sem degradação de latência.

## Referências

- ADR 024 — AI Gateway: Roteamento Inteligente Multi-Provider
- ADR 026 — Observabilidade de IA: Métricas de Alucinação e Qualidade
- ADR 021 — Governança de Shadow AI
- ADR 017 — FinOps como Princípio Arquitetural
- REQ-AI-003 — Requisitos de Experimentação de IA
