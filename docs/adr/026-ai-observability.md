# ADR 026: Observabilidade de IA — Métricas de Qualidade e Custo

## Status

**Aceito** — Março 2026

## Contexto

O ADR 017 (FinOps) estabeleceu a alocação de custos de infraestrutura por tenant, e o ADR 021 (Shadow AI) implementou metering básico de chamadas de IA (tokens, latência, custo). No entanto, operações de IA têm características fundamentalmente diferentes de operações de infraestrutura tradicional que exigem uma camada de observabilidade especializada:

1. **Custo variável por request**: Uma chamada de API REST custa centavos de CPU; uma chamada de IA pode custar de $0.001 (classificação com modelo pequeno) a $0.50 (geração longa com GPT-4). Sem granularidade de custo por operação, é impossível fazer FinOps efetivo para IA.
2. **Qualidade não-determinística**: A mesma chamada de IA pode produzir outputs de qualidade distinta em execuções diferentes. Métricas tradicionais (latência, error rate) não capturam se o output é útil, correto ou relevante.
3. **Hallucination risk**: Modelos de IA podem gerar informações factualmente incorretas com alta confiança. Para operações com ground truth (moderação de conteúdo, extração de entidades, classificação), é possível detectar e medir a taxa de alucinações.
4. **Feedback loop ausente**: Sem mecanismo para capturar feedback do usuário final (rating, aceitação/rejeição de sugestão), é impossível melhorar a qualidade das features de IA de forma data-driven.
5. **Cost attribution opaca**: O custo de IA deve ser alocável por tenant, por feature e por operação para que decisões de pricing (ADR 014) sejam fundamentadas.

A observabilidade de IA vai além de logs e métricas de infraestrutura — precisa capturar a qualidade semântica dos outputs e correlacionar com custos para otimização contínua.

## Decisão

Implementamos uma **camada de observabilidade de IA** com três pilares: coleta de métricas operacionais, avaliação de qualidade, e detecção de alucinações.

### 1. AiMetricsCollector — Coleta de Métricas por Operação

O collector registra métricas detalhadas de cada operação de IA, com granularidade por tenant, feature e modelo:

```typescript
// ai-observability/src/metrics/ai-metrics-collector.ts
@Injectable()
export class AiMetricsCollector {
  constructor(
    private readonly metricsRepo: AiOperationMetricsRepository,
    private readonly prometheus: PrometheusService,
    private readonly costAllocator: AiCostAllocator,
  ) {}

  async record(operation: AiOperationRecord): Promise<void> {
    // 1. Calcular custo detalhado (input + output tokens)
    const cost = this.calculateCost(operation);

    // 2. Persistir métrica no banco para análise histórica
    await this.metricsRepo.insert({
      tenantId: operation.tenantId,
      feature: operation.feature,
      operationType: operation.operationType,
      provider: operation.provider,
      modelId: operation.modelId,
      inputTokens: operation.inputTokens,
      outputTokens: operation.outputTokens,
      totalTokens: operation.inputTokens + operation.outputTokens,
      latencyMs: operation.latencyMs,
      costUsd: cost.total,
      costInputUsd: cost.input,
      costOutputUsd: cost.output,
      fromCache: operation.fromCache,
      fallbackUsed: operation.fallbackUsed,
      qualityScore: operation.qualityScore,
      statusCode: operation.statusCode,
      errorType: operation.errorType,
      correlationId: operation.correlationId,
    });

    // 3. Emitir métricas para Prometheus (dashboards em tempo real)
    this.prometheus.histogram('ai_operation_latency_ms', operation.latencyMs, {
      tenant_id: operation.tenantId,
      feature: operation.feature,
      provider: operation.provider,
      model: operation.modelId,
    });

    this.prometheus.counter('ai_operation_tokens_total', operation.inputTokens + operation.outputTokens, {
      tenant_id: operation.tenantId,
      feature: operation.feature,
      token_type: 'total',
    });

    this.prometheus.counter('ai_operation_cost_usd', cost.total, {
      tenant_id: operation.tenantId,
      feature: operation.feature,
      provider: operation.provider,
    });

    if (operation.fromCache) {
      this.prometheus.counter('ai_cache_hits_total', 1, {
        tenant_id: operation.tenantId,
        feature: operation.feature,
      });
    }

    if (operation.fallbackUsed) {
      this.prometheus.counter('ai_fallback_total', 1, {
        tenant_id: operation.tenantId,
        feature: operation.feature,
        provider: operation.provider,
      });
    }

    // 4. Alocar custo para FinOps do tenant
    await this.costAllocator.allocate({
      tenantId: operation.tenantId,
      serviceType: 'AI_API',
      subType: `${operation.feature}:${operation.provider}`,
      costUsd: cost.total,
      usageQuantity: operation.inputTokens + operation.outputTokens,
      usageUnit: 'tokens',
    });
  }

  private calculateCost(operation: AiOperationRecord): AiOperationCost {
    if (operation.fromCache) {
      return { input: 0, output: 0, total: 0 };
    }

    const inputCost = (operation.inputTokens / 1000) * operation.costPer1kInput;
    const outputCost = (operation.outputTokens / 1000) * operation.costPer1kOutput;

    return {
      input: Number(inputCost.toFixed(6)),
      output: Number(outputCost.toFixed(6)),
      total: Number((inputCost + outputCost).toFixed(6)),
    };
  }
}
```

### 2. QualityEvaluator — Avaliação de Qualidade por Feature

O evaluator implementa estratégias de avaliação específicas por tipo de feature, combinando heurísticas automáticas e feedback do usuário:

```typescript
// ai-observability/src/quality/quality-evaluator.ts
@Injectable()
export class QualityEvaluator {
  private readonly evaluators: Record<string, FeatureQualityEvaluator>;

  constructor(
    private readonly feedbackRepo: AiQualityFeedbackRepository,
    private readonly metricsRepo: AiOperationMetricsRepository,
  ) {
    this.evaluators = {
      SEARCH: new SearchQualityEvaluator(),
      MATCHING: new MatchingQualityEvaluator(),
      MODERATION: new ModerationQualityEvaluator(),
      RECOMMENDATIONS: new RecommendationQualityEvaluator(),
      CLASSIFICATION: new ClassificationQualityEvaluator(),
    };
  }

  async evaluate(
    feature: string,
    request: AiRequest,
    response: AiResponse,
    context?: EvaluationContext,
  ): Promise<QualityScore> {
    const evaluator = this.evaluators[feature];
    if (!evaluator) {
      return { score: null, method: 'NONE', details: 'No evaluator for feature' };
    }

    // Avaliação automática por heurísticas
    const automaticScore = evaluator.evaluateAutomatic(request, response, context);

    return {
      score: automaticScore.score,
      method: 'AUTOMATIC',
      details: automaticScore.details,
      breakdown: automaticScore.breakdown,
    };
  }

  async incorporateFeedback(
    operationId: string,
    feedback: UserFeedback,
  ): Promise<void> {
    // Registrar feedback do usuário
    await this.feedbackRepo.insert({
      operationId,
      feedbackType: feedback.type,
      rating: feedback.rating,             // 1-5 ou thumbs up/down
      accepted: feedback.accepted,          // Usuário aceitou a sugestão?
      correctedOutput: feedback.correction, // Output corrigido pelo usuário
      feedbackAt: new Date(),
    });

    // Atualizar quality score da operação com feedback real
    const operation = await this.metricsRepo.findById(operationId);
    if (operation) {
      const feedbackScore = this.normalizeRating(feedback.rating);
      const combinedScore = operation.qualityScore
        ? operation.qualityScore * 0.4 + feedbackScore * 0.6 // Feedback pesa mais
        : feedbackScore;

      await this.metricsRepo.updateQualityScore(operationId, combinedScore);
    }
  }

  private normalizeRating(rating: number): number {
    // Normalizar rating 1-5 para score 0-1
    return (rating - 1) / 4;
  }
}

// Avaliadores específicos por feature
class SearchQualityEvaluator implements FeatureQualityEvaluator {
  evaluateAutomatic(
    request: AiRequest,
    response: AiResponse,
    context?: EvaluationContext,
  ): AutomaticScore {
    const breakdown: Record<string, number> = {};

    // Relevância: resposta contém termos-chave do query?
    breakdown.keywordPresence = this.measureKeywordPresence(
      request.prompt,
      response.content,
    );

    // Completude: resposta tem resultados suficientes?
    breakdown.resultCount = Math.min(
      (response.metadata?.resultCount ?? 0) / 10,
      1.0,
    );

    // Diversidade: resultados não são todos iguais?
    breakdown.diversity = response.metadata?.diversityScore ?? 0.5;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0) / Object.keys(breakdown).length;

    return {
      score: Number(score.toFixed(3)),
      details: 'Search quality based on keyword presence, result count, and diversity',
      breakdown,
    };
  }

  private measureKeywordPresence(query: string, content: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (queryTerms.length === 0) return 0.5;

    const contentLower = content.toLowerCase();
    const present = queryTerms.filter((t) => contentLower.includes(t)).length;
    return present / queryTerms.length;
  }
}

class ModerationQualityEvaluator implements FeatureQualityEvaluator {
  evaluateAutomatic(
    request: AiRequest,
    response: AiResponse,
    context?: EvaluationContext,
  ): AutomaticScore {
    const breakdown: Record<string, number> = {};

    // Confiança da classificação
    breakdown.confidence = response.metadata?.confidence ?? 0.5;

    // Consistência com regras conhecidas
    if (context?.knownLabels) {
      breakdown.accuracy = response.metadata?.label === context.knownLabels
        ? 1.0
        : 0.0;
    }

    // Velocidade da decisão (moderação deve ser rápida)
    breakdown.latencyScore = response.latencyMs < 500 ? 1.0
      : response.latencyMs < 2000 ? 0.7
      : 0.3;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0) / Object.keys(breakdown).length;

    return {
      score: Number(score.toFixed(3)),
      details: 'Moderation quality based on confidence, accuracy, and latency',
      breakdown,
    };
  }
}
```

### 3. HallucinationDetector — Detecção de Alucinações

Para operações onde existe ground truth (dados de referência), o detector compara o output do modelo com a realidade:

```typescript
// ai-observability/src/quality/hallucination-detector.ts
@Injectable()
export class HallucinationDetector {
  constructor(
    private readonly metricsRepo: AiOperationMetricsRepository,
    private readonly feedbackRepo: AiQualityFeedbackRepository,
  ) {}

  async detect(
    operation: AiOperationRecord,
    response: AiResponse,
    groundTruth: GroundTruth,
  ): Promise<HallucinationResult> {
    const detections: HallucinationDetection[] = [];

    // 1. Verificar entidades factuais mencionadas na resposta
    if (groundTruth.entities) {
      const entityCheck = this.checkEntities(response.content, groundTruth.entities);
      detections.push(entityCheck);
    }

    // 2. Verificar valores numéricos
    if (groundTruth.numericValues) {
      const numericCheck = this.checkNumericValues(response.content, groundTruth.numericValues);
      detections.push(numericCheck);
    }

    // 3. Verificar categorias/classificações
    if (groundTruth.expectedCategory) {
      const categoryCheck = this.checkCategory(response.metadata, groundTruth.expectedCategory);
      detections.push(categoryCheck);
    }

    // 4. Verificar contradições internas
    const contradictionCheck = this.checkInternalConsistency(response.content);
    detections.push(contradictionCheck);

    // Calcular score geral de alucinação
    const hallucinationRate = detections.filter((d) => d.isHallucination).length / detections.length;

    const result: HallucinationResult = {
      operationId: operation.correlationId,
      hallucinationRate,
      isHallucinated: hallucinationRate > 0.3, // Threshold: mais de 30% dos checks falharam
      detections,
      overallConfidence: this.calculateConfidence(detections),
    };

    // Registrar resultado como feedback automático
    await this.feedbackRepo.insert({
      operationId: operation.correlationId,
      feedbackType: 'HALLUCINATION_CHECK',
      rating: Math.round((1 - hallucinationRate) * 5),
      accepted: !result.isHallucinated,
      correctedOutput: result.isHallucinated
        ? JSON.stringify(groundTruth)
        : null,
      feedbackAt: new Date(),
      metadata: {
        detections: detections.length,
        hallucinationsFound: detections.filter((d) => d.isHallucination).length,
      },
    });

    return result;
  }

  private checkEntities(
    content: string,
    entities: GroundTruthEntity[],
  ): HallucinationDetection {
    const contentLower = content.toLowerCase();
    let correct = 0;
    let fabricated = 0;
    const issues: string[] = [];

    for (const entity of entities) {
      if (entity.shouldBePresent) {
        if (contentLower.includes(entity.value.toLowerCase())) {
          correct++;
        } else {
          issues.push(`Missing expected entity: ${entity.value}`);
        }
      }

      if (entity.shouldNotBePresent) {
        if (contentLower.includes(entity.value.toLowerCase())) {
          fabricated++;
          issues.push(`Fabricated entity present: ${entity.value}`);
        }
      }
    }

    return {
      checkType: 'ENTITY_VERIFICATION',
      isHallucination: fabricated > 0 || correct < entities.filter((e) => e.shouldBePresent).length * 0.7,
      confidence: entities.length > 0 ? (correct + (entities.length - fabricated)) / (entities.length * 2) : 0.5,
      details: issues.length > 0 ? issues.join('; ') : 'All entities verified',
    };
  }

  private checkNumericValues(
    content: string,
    expectedValues: GroundTruthNumeric[],
  ): HallucinationDetection {
    const issues: string[] = [];
    let matches = 0;

    for (const expected of expectedValues) {
      const pattern = new RegExp(`${expected.label}[:\\s]*([\\d,.]+)`, 'i');
      const match = content.match(pattern);

      if (match) {
        const extracted = parseFloat(match[1].replace(',', ''));
        const tolerance = expected.tolerance ?? 0.01;
        const deviation = Math.abs(extracted - expected.value) / Math.max(expected.value, 1);

        if (deviation <= tolerance) {
          matches++;
        } else {
          issues.push(
            `${expected.label}: expected ${expected.value}, found ${extracted} (deviation: ${(deviation * 100).toFixed(1)}%)`,
          );
        }
      }
    }

    return {
      checkType: 'NUMERIC_VERIFICATION',
      isHallucination: issues.length > 0,
      confidence: expectedValues.length > 0 ? matches / expectedValues.length : 0.5,
      details: issues.length > 0 ? issues.join('; ') : 'All numeric values verified',
    };
  }

  private checkCategory(
    metadata: Record<string, unknown>,
    expected: string,
  ): HallucinationDetection {
    const actual = metadata?.category || metadata?.label || metadata?.classification;

    return {
      checkType: 'CATEGORY_VERIFICATION',
      isHallucination: actual !== expected,
      confidence: actual ? 1.0 : 0.5,
      details: actual === expected
        ? `Category matches: ${expected}`
        : `Category mismatch: expected ${expected}, got ${actual}`,
    };
  }

  private checkInternalConsistency(content: string): HallucinationDetection {
    // Verificações heurísticas de consistência interna
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    // Simplificação: verificar se há afirmações contraditórias óbvias
    // (implementação completa usaria NLI model)
    const hasContradiction = false; // Placeholder para NLI check

    return {
      checkType: 'INTERNAL_CONSISTENCY',
      isHallucination: hasContradiction,
      confidence: 0.6, // Heurísticas têm confiança menor
      details: hasContradiction
        ? 'Internal contradictions detected'
        : 'No obvious contradictions found',
    };
  }

  private calculateConfidence(detections: HallucinationDetection[]): number {
    if (detections.length === 0) return 0;
    return detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
  }
}
```

### 4. Schema de Banco — Métricas e Feedback

```sql
-- Métricas detalhadas de cada operação de IA
CREATE TABLE ai_operation_metrics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    feature             VARCHAR(50) NOT NULL,
    operation_type      VARCHAR(50) NOT NULL,     -- COMPLETION, EMBEDDING, CLASSIFICATION, MODERATION
    provider            VARCHAR(50) NOT NULL,     -- OPENAI, ANTHROPIC, OLLAMA
    model_id            VARCHAR(100) NOT NULL,
    input_tokens        INTEGER NOT NULL,
    output_tokens       INTEGER NOT NULL,
    total_tokens        INTEGER NOT NULL,
    latency_ms          INTEGER NOT NULL,
    cost_usd            NUMERIC(10, 6) NOT NULL,
    cost_input_usd      NUMERIC(10, 6) NOT NULL,
    cost_output_usd     NUMERIC(10, 6) NOT NULL,
    from_cache          BOOLEAN DEFAULT false,
    fallback_used       BOOLEAN DEFAULT false,
    quality_score       NUMERIC(4, 3),            -- 0.000 a 1.000
    status_code         INTEGER NOT NULL,         -- 200, 429, 500, etc.
    error_type          VARCHAR(50),              -- TIMEOUT, RATE_LIMIT, PROVIDER_ERROR, etc.
    correlation_id      UUID NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consulta por tenant e período (FinOps dashboard)
CREATE INDEX idx_ai_metrics_tenant_period
    ON ai_operation_metrics (tenant_id, created_at DESC);

-- Índice para análise por feature e modelo (quality dashboard)
CREATE INDEX idx_ai_metrics_feature_model
    ON ai_operation_metrics (feature, model_id, created_at DESC);

-- Índice para agregação de custo por tenant/mês
CREATE INDEX idx_ai_metrics_cost_allocation
    ON ai_operation_metrics (tenant_id, feature, date_trunc('month', created_at));

-- Índice para métricas de cache e fallback
CREATE INDEX idx_ai_metrics_cache_fallback
    ON ai_operation_metrics (feature, from_cache, fallback_used, created_at DESC);

-- Feedback de qualidade de usuários e avaliações automáticas
CREATE TABLE ai_quality_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id        UUID NOT NULL,
    feedback_type       VARCHAR(30) NOT NULL
                        CHECK (feedback_type IN (
                          'USER_RATING',           -- Rating explícito do usuário (1-5)
                          'USER_ACCEPTANCE',        -- Usuário aceitou/rejeitou sugestão
                          'HALLUCINATION_CHECK',    -- Verificação automática de alucinação
                          'OUTCOME_COMPARISON',     -- Comparação com resultado real
                          'A_B_TEST'                -- Resultado de teste A/B
                        )),
    rating              SMALLINT,                  -- 1-5 (para USER_RATING)
    accepted            BOOLEAN,                   -- true/false (para USER_ACCEPTANCE)
    corrected_output    TEXT,                       -- Output corrigido pelo usuário
    metadata            JSONB DEFAULT '{}',
    feedback_at         TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consulta de feedback por operação
CREATE INDEX idx_feedback_operation
    ON ai_quality_feedback (operation_id, feedback_type);

-- Índice para análise temporal de feedback
CREATE INDEX idx_feedback_temporal
    ON ai_quality_feedback (feedback_type, feedback_at DESC);

-- Views para dashboards

-- Custo de IA por tenant por mês (FinOps-AI)
CREATE VIEW ai_cost_per_tenant_monthly AS
SELECT
    tenant_id,
    date_trunc('month', created_at) AS month,
    feature,
    provider,
    COUNT(*) AS total_operations,
    SUM(total_tokens) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd,
    SUM(cost_input_usd) AS total_input_cost_usd,
    SUM(cost_output_usd) AS total_output_cost_usd,
    ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms,
    ROUND(AVG(quality_score)::numeric, 3) AS avg_quality_score,
    COUNT(*) FILTER (WHERE from_cache = true) AS cache_hits,
    COUNT(*) FILTER (WHERE fallback_used = true) AS fallback_count,
    COUNT(*) FILTER (WHERE error_type IS NOT NULL) AS error_count,
    ROUND(
        COUNT(*) FILTER (WHERE from_cache = true)::numeric / COUNT(*)::numeric * 100,
        2
    ) AS cache_hit_rate_pct,
    ROUND(
        COUNT(*) FILTER (WHERE error_type IS NOT NULL)::numeric / COUNT(*)::numeric * 100,
        2
    ) AS error_rate_pct
FROM ai_operation_metrics
GROUP BY tenant_id, date_trunc('month', created_at), feature, provider;

-- Qualidade por modelo (para decisões de routing)
CREATE VIEW ai_model_quality AS
SELECT
    model_id,
    provider,
    feature,
    COUNT(*) AS total_operations,
    ROUND(AVG(quality_score)::numeric, 3) AS avg_quality,
    ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency_ms,
    ROUND(AVG(cost_usd)::numeric, 6) AS avg_cost_per_request,
    ROUND(
        COUNT(*) FILTER (WHERE error_type IS NOT NULL)::numeric / COUNT(*)::numeric * 100,
        2
    ) AS error_rate_pct
FROM ai_operation_metrics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY model_id, provider, feature;
```

### 5. FinOps-AI Dashboard — Painéis

```
┌─────────────────────────────────────────────────────────────────┐
│                    FinOps-AI Dashboard                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Custo Total AI - Mês]     [Custo por Tenant - Top 10]         │
│  ┌──────────────────┐       ┌────────────────────────────┐      │
│  │  $4,328.50       │       │  Tenant A    $1,240.30     │      │
│  │  ▲ 12% vs mês    │       │  Tenant B    $890.20       │      │
│  │  anterior         │       │  Tenant C    $650.10       │      │
│  └──────────────────┘       │  ...                       │      │
│                              └────────────────────────────┘      │
│                                                                  │
│  [Custo por Feature]         [Custo por Provider]                │
│  ┌──────────────────┐       ┌────────────────────────────┐      │
│  │  Search    42%   │       │  OpenAI      65%           │      │
│  │  Matching  28%   │       │  Anthropic   25%           │      │
│  │  Moderation 18% │       │  Ollama      10%           │      │
│  │  Recommend  12% │       └────────────────────────────┘      │
│  └──────────────────┘                                           │
│                                                                  │
│  [Quality Score - 30d Trend]  [Cache Hit Rate]                  │
│  ┌──────────────────┐       ┌────────────────────────────┐      │
│  │  ~~~0.85~~~      │       │  Overall: 47%              │      │
│  │  Avg: 0.82       │       │  Moderation: 62%           │      │
│  │  Min: 0.71       │       │  Search: 38%               │      │
│  └──────────────────┘       └────────────────────────────┘      │
│                                                                  │
│  [Hallucination Rate]        [Fallback Rate por Provider]       │
│  ┌──────────────────┐       ┌────────────────────────────┐      │
│  │  Overall: 3.2%   │       │  OpenAI → Anthropic: 2.1% │      │
│  │  Moderation: 1.1%│       │  Anthropic → Ollama: 0.8% │      │
│  │  Search: 4.8%    │       │  Total fallbacks: 156      │      │
│  └──────────────────┘       └────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6. Alertas Configurados

```typescript
// ai-observability/src/alerts/ai-alert-rules.ts
const AI_ALERT_RULES: AlertRule[] = [
  {
    name: 'ai_cost_daily_spike',
    description: 'Custo diário de IA de tenant excede 2x a média dos últimos 7 dias',
    query: `
      SELECT tenant_id, SUM(cost_usd) as today_cost
      FROM ai_operation_metrics
      WHERE created_at >= CURRENT_DATE
      GROUP BY tenant_id
      HAVING SUM(cost_usd) > (
        SELECT AVG(daily_cost) * 2
        FROM (
          SELECT SUM(cost_usd) as daily_cost
          FROM ai_operation_metrics
          WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            AND created_at < CURRENT_DATE
          GROUP BY DATE(created_at)
        ) daily_avg
      )
    `,
    severity: 'WARNING',
    channel: 'slack:#finops-alerts',
  },
  {
    name: 'ai_quality_degradation',
    description: 'Quality score médio cai abaixo de 0.7 para uma feature',
    condition: 'avg(quality_score) < 0.7 over 1h',
    severity: 'CRITICAL',
    channel: 'slack:#ai-quality-alerts,pagerduty',
  },
  {
    name: 'ai_hallucination_spike',
    description: 'Taxa de alucinação excede 10% em qualquer feature',
    condition: 'hallucination_rate > 0.10 over 30m',
    severity: 'CRITICAL',
    channel: 'slack:#ai-quality-alerts,pagerduty',
  },
  {
    name: 'ai_error_rate_high',
    description: 'Error rate de operações de IA excede 5%',
    condition: 'error_rate > 0.05 over 15m',
    severity: 'WARNING',
    channel: 'slack:#ai-ops-alerts',
  },
  {
    name: 'ai_cache_hit_rate_low',
    description: 'Cache hit rate cai abaixo de 20% (possível problema no cache semântico)',
    condition: 'cache_hit_rate < 0.20 over 1h',
    severity: 'WARNING',
    channel: 'slack:#ai-ops-alerts',
  },
  {
    name: 'ai_tenant_budget_threshold',
    description: 'Tenant atinge 80% do budget mensal de IA',
    condition: 'monthly_cost / monthly_budget >= 0.80',
    severity: 'WARNING',
    channel: 'slack:#finops-alerts',
  },
];
```

## Consequências

### Positivas
- Visibilidade total de custo de IA por tenant, feature e provider — base para pricing sustentável e alocação de custo.
- Quality scores permitem comparação objetiva entre modelos e decisões data-driven de roteamento (alimentando CostBasedSelector do ADR 024).
- Detecção de alucinações reduz risco de features de IA entregarem informações incorretas aos usuários.
- Feedback loops permitem melhoria contínua da qualidade via dados reais de usuários.
- Alertas proativos previnem surpresas de custo e degradação silenciosa de qualidade.
- Dashboard FinOps-AI unifica métricas financeiras e de qualidade em uma visão integrada.

### Negativas
- Volume de dados: cada operação de IA gera um registro detalhado — necessita política de retenção e particionamento.
- Overhead de coleta: ~5ms adicionais por operação para registrar métricas e calcular custos.
- Hallucination detection requer ground truth, que nem sempre está disponível para todas as operações.
- Quality evaluators são heurísticos — scores automáticos podem não refletir a percepção real do usuário (mitigado com feedback loop).
- Complexidade de manter evaluators específicos por feature conforme novas features de IA são adicionadas.

## Implementação

- **AiMetricsCollector** integrado ao AI Gateway como middleware de saída (post-response hook).
- **QualityEvaluator** executado assincronamente após a resposta (não bloqueia a latência do request).
- **HallucinationDetector** executado apenas para features com ground truth configurado (moderação, classificação, extração).
- **Tabela ai_operation_metrics** particionada por mês (`PARTITION BY RANGE (created_at)`) com retenção de 12 meses.
- **Tabela ai_quality_feedback** com retenção de 24 meses (feedback é valioso para treinamento futuro).
- **Grafana Dashboard** com os painéis descritos na seção 5, atualizado em tempo real via Prometheus.
- **Alertas** configurados no Grafana Alerting com routing para Slack e PagerDuty conforme severidade.
- **API de feedback** exposta no frontend para capturar ratings e aceitação/rejeição de sugestões de IA.

## Validação

- Teste de coleta: executar operação de IA e verificar que registro é criado em `ai_operation_metrics` com todos os campos preenchidos.
- Teste de custo: verificar que cálculo de custo (input + output tokens * preço por 1k) está correto para cada provider.
- Teste de quality score: executar operação de busca com resultados conhecidos e verificar que score reflete relevância.
- Teste de hallucination: enviar operação de classificação com ground truth e verificar que alucinações são detectadas quando modelo erra.
- Teste de feedback: enviar rating de usuário e verificar que quality score é atualizado combinando score automático e feedback.
- Teste de cache attribution: operações de cache hit devem ter custo $0.00 na tabela de métricas.
- Teste de alertas: simular spike de custo e verificar que alerta é disparado em < 5 minutos.
- Teste de FinOps view: verificar que soma de custos na view `ai_cost_per_tenant_monthly` bate com custo real do provider.
- Teste de particionamento: verificar que queries em `ai_operation_metrics` usam partition pruning para performance.

## Referências

- ADR 017 — FinOps como Princípio Arquitetural
- ADR 021 — Governança de Shadow AI
- ADR 024 — AI Gateway — Roteamento Inteligente Multi-Provider
- ADR 014 — Pricing Baseado em Outcomes
- ADR 013 — Trust Infrastructure
- REQ-AI-005 — Requisitos de Observabilidade de Operações de IA
