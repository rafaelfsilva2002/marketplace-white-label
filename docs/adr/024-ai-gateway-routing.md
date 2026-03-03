# ADR 024: AI Gateway — Roteamento Inteligente Multi-Provider

## Status

**Aceito** — Março 2026

## Contexto

O ADR 021 estabeleceu o AI Gateway como proxy centralizado para governança de Shadow AI, garantindo sanitização de PII, feature flags por tenant, e metering de custos. Porém, o roteamento de modelos descrito no ADR 021 é estático — cada tenant/feature tem um modelo fixo configurado na tabela `tenant_ai_config`. Na prática, a dinâmica de provedores de IA exige um sistema de roteamento muito mais sofisticado.

Cenários que o roteamento estático não resolve:

1. **Fallback automático**: Quando a OpenAI está com latência elevada ou indisponível, o sistema deve rotear automaticamente para Anthropic ou Ollama local sem intervenção humana.
2. **Otimização de custo**: Para operações de baixa complexidade (classificação binária, extração de entidades simples), usar GPT-4 Turbo é desperdício — um modelo menor (GPT-3.5, Haiku) atinge a mesma qualidade por uma fração do custo.
3. **Cache semântico**: Prompts semanticamente idênticos (mas textualmente diferentes) geram chamadas duplicadas a provedores de IA, desperdiçando tokens e aumentando latência.
4. **Rate limiting heterogêneo**: Cada provedor tem limites de taxa distintos (RPM, TPM), e cada tenant tem budget diferente. O roteamento deve balancear esses constraints simultaneamente.
5. **Compliance por região**: Alguns tenants (especialmente em mercados regulados) podem exigir que dados não saiam do país — exigindo roteamento para modelos locais (Ollama) ou provedores com data residency garantida.

A evolução do AI Gateway para um sistema de roteamento inteligente é necessária para suportar a escala multi-tenant com custos controlados e alta disponibilidade.

## Decisão

Expandimos o AI Gateway (ADR 021) com um **sistema de roteamento inteligente multi-provider** composto por três componentes principais: ModelRouter, SemanticCache e CostBasedSelector.

### 1. ModelRouter — Orquestração de Roteamento

O ModelRouter é o ponto de entrada que coordena a seleção de modelo, verificação de cache, e execução com fallback:

```typescript
// ai-gateway/src/routing/model-router.ts
@Injectable()
export class ModelRouter {
  constructor(
    private readonly semanticCache: SemanticCache,
    private readonly costSelector: CostBasedSelector,
    private readonly circuitBreakerRegistry: CircuitBreakerRegistry,
    private readonly rateLimiter: TenantRateLimiter,
    private readonly healthChecker: ProviderHealthChecker,
  ) {}

  async route(request: AiRoutingRequest): Promise<AiResponse> {
    // 1. Verificar rate limit do tenant
    await this.rateLimiter.assertWithinLimits(request.tenantId, request.feature);

    // 2. Verificar cache semântico
    const cached = await this.semanticCache.lookup(
      request.tenantId,
      request.prompt,
      request.feature,
    );
    if (cached && cached.similarity >= request.cacheThreshold) {
      return { ...cached.response, fromCache: true, cacheScore: cached.similarity };
    }

    // 3. Obter candidatos de modelo ordenados por custo-eficiência
    const candidates = await this.costSelector.selectCandidates(
      request.tenantId,
      request.feature,
      request.qualityThreshold,
    );

    // 4. Filtrar por saúde do provedor (circuit breaker)
    const healthyCandidates = candidates.filter((c) =>
      this.circuitBreakerRegistry.isHealthy(c.provider),
    );

    if (healthyCandidates.length === 0) {
      throw new AllProvidersUnavailableError(request.feature);
    }

    // 5. Executar com fallback chain
    return this.executeWithFallback(request, healthyCandidates);
  }

  private async executeWithFallback(
    request: AiRoutingRequest,
    candidates: ModelCandidate[],
  ): Promise<AiResponse> {
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        const response = await this.circuitBreakerRegistry
          .getBreaker(candidate.provider)
          .execute(() =>
            this.providers[candidate.provider].complete({
              model: candidate.modelId,
              prompt: request.prompt,
              maxTokens: candidate.maxTokens,
              temperature: candidate.temperature,
            }),
          );

        // Armazenar no cache semântico para futuras consultas
        await this.semanticCache.store(
          request.tenantId,
          request.prompt,
          request.feature,
          response,
          candidate,
        );

        return {
          ...response,
          routingMetadata: {
            selectedModel: candidate.modelId,
            selectedProvider: candidate.provider,
            fallbackUsed: candidate !== candidates[0],
            candidatesEvaluated: candidates.length,
          },
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Provider ${candidate.provider}/${candidate.modelId} failed, trying next`,
          { error: error.message, feature: request.feature },
        );
      }
    }

    throw new AiRoutingExhaustedError(
      `All ${candidates.length} candidates failed`,
      lastError,
    );
  }
}
```

### 2. SemanticCache — Cache por Similaridade de Prompts

O SemanticCache utiliza pgvector para encontrar respostas previamente computadas para prompts semanticamente similares, evitando chamadas redundantes a provedores de IA:

```typescript
// ai-gateway/src/cache/semantic-cache.ts
@Injectable()
export class SemanticCache {
  private readonly DEFAULT_SIMILARITY_THRESHOLD = 0.95;
  private readonly DEFAULT_TTL_HOURS = 24;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly cacheRepo: SemanticCacheRepository,
  ) {}

  async lookup(
    tenantId: string,
    prompt: string,
    feature: string,
    threshold?: number,
  ): Promise<CacheLookupResult | null> {
    const similarityThreshold = threshold ?? this.DEFAULT_SIMILARITY_THRESHOLD;

    // Gerar embedding do prompt atual
    const promptEmbedding = await this.embeddingService.embed(prompt, 'cache-lookup');

    // Buscar no pgvector por prompts similares do mesmo tenant e feature
    const match = await this.cacheRepo.findSimilar(
      tenantId,
      feature,
      promptEmbedding,
      similarityThreshold,
    );

    if (!match) return null;

    // Verificar TTL
    if (this.isExpired(match)) {
      await this.cacheRepo.markExpired(match.id);
      return null;
    }

    // Incrementar hit count para métricas
    await this.cacheRepo.incrementHits(match.id);

    return {
      response: match.cachedResponse,
      similarity: match.similarity,
      originalPrompt: match.originalPrompt,
      cachedAt: match.createdAt,
    };
  }

  async store(
    tenantId: string,
    prompt: string,
    feature: string,
    response: AiResponse,
    model: ModelCandidate,
  ): Promise<void> {
    const promptEmbedding = await this.embeddingService.embed(prompt, 'cache-store');

    await this.cacheRepo.upsert({
      tenantId,
      feature,
      promptHash: this.hashPrompt(prompt),
      promptEmbedding,
      originalPrompt: prompt,
      cachedResponse: response,
      modelId: model.modelId,
      provider: model.provider,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      ttlHours: this.getTtlForFeature(feature),
    });
  }

  private getTtlForFeature(feature: string): number {
    const ttlMap: Record<string, number> = {
      MODERATION: 48,      // Moderação muda pouco
      CLASSIFICATION: 24,  // Classificações são estáveis
      SEARCH: 6,           // Busca pode ter resultados dinâmicos
      RECOMMENDATIONS: 1,  // Recomendações mudam frequentemente
    };
    return ttlMap[feature] ?? this.DEFAULT_TTL_HOURS;
  }

  private isExpired(entry: CacheEntry): boolean {
    const ttlMs = entry.ttlHours * 60 * 60 * 1000;
    return Date.now() - entry.createdAt.getTime() > ttlMs;
  }

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex');
  }
}
```

### 3. CostBasedSelector — Seleção por Custo-Eficiência

O CostBasedSelector ordena modelos candidatos pelo menor custo que atende ao threshold de qualidade exigido pela operação:

```typescript
// ai-gateway/src/routing/cost-based-selector.ts
@Injectable()
export class CostBasedSelector {
  constructor(
    private readonly modelRegistry: ModelRegistryRepository,
    private readonly qualityHistory: QualityHistoryRepository,
    private readonly tenantConfig: TenantAiConfigRepository,
    private readonly costTracker: TenantCostTracker,
  ) {}

  async selectCandidates(
    tenantId: string,
    feature: string,
    qualityThreshold: number,
  ): Promise<ModelCandidate[]> {
    // 1. Obter configuração do tenant (limites de custo, providers permitidos)
    const config = await this.tenantConfig.getConfig(tenantId, feature);

    // 2. Verificar budget restante do tenant no mês
    const remainingBudget = await this.costTracker.getRemainingBudget(
      tenantId,
      config.maxCostPerMonth,
    );

    if (remainingBudget <= 0) {
      throw new TenantBudgetExceededError(tenantId, feature);
    }

    // 3. Obter todos os modelos ativos compatíveis com a feature
    const models = await this.modelRegistry.findActiveByFeature(feature);

    // 4. Filtrar por providers permitidos pelo tenant
    const allowedModels = models.filter((m) =>
      config.allowedProviders.includes(m.provider),
    );

    // 5. Enriquecer com histórico de qualidade para esta feature
    const scoredModels = await Promise.all(
      allowedModels.map(async (model) => {
        const quality = await this.qualityHistory.getAverageQuality(
          model.id,
          feature,
          30, // últimos 30 dias
        );

        return {
          ...model,
          avgQualityScore: quality.avgScore,
          avgLatencyMs: quality.avgLatencyMs,
          errorRate: quality.errorRate,
          costPerRequest: this.estimateCostPerRequest(model, feature),
          costEfficiency: quality.avgScore / this.estimateCostPerRequest(model, feature),
        };
      }),
    );

    // 6. Filtrar por threshold de qualidade
    const qualifiedModels = scoredModels.filter(
      (m) => m.avgQualityScore >= qualityThreshold && m.errorRate < 0.05,
    );

    // 7. Ordenar por custo-eficiência (melhor qualidade por dólar)
    return qualifiedModels
      .sort((a, b) => b.costEfficiency - a.costEfficiency)
      .map((m) => ({
        modelId: m.modelId,
        provider: m.provider,
        maxTokens: m.capabilities.maxTokens,
        temperature: config.temperature ?? m.defaultTemperature,
        estimatedCost: m.costPerRequest,
        qualityScore: m.avgQualityScore,
      }));
  }

  private estimateCostPerRequest(model: ModelRecord, feature: string): number {
    const avgTokens = this.getAvgTokensByFeature(feature);
    return (
      (avgTokens.input / 1000) * model.costPer1kInput +
      (avgTokens.output / 1000) * model.costPer1kOutput
    );
  }

  private getAvgTokensByFeature(feature: string): { input: number; output: number } {
    const estimates: Record<string, { input: number; output: number }> = {
      MODERATION: { input: 500, output: 50 },
      CLASSIFICATION: { input: 300, output: 20 },
      SEARCH: { input: 200, output: 100 },
      MATCHING: { input: 800, output: 200 },
      RECOMMENDATIONS: { input: 600, output: 300 },
    };
    return estimates[feature] ?? { input: 500, output: 200 };
  }
}
```

### 4. Circuit Breaker e Health Checks por Provider

```typescript
// ai-gateway/src/resilience/circuit-breaker-registry.ts
@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly healthChecker: ProviderHealthChecker) {
    this.initializeBreakers();
  }

  private initializeBreakers(): void {
    const providers = ['OPENAI', 'ANTHROPIC', 'OLLAMA'];

    for (const provider of providers) {
      this.breakers.set(
        provider,
        new CircuitBreaker({
          failureThreshold: 5,         // 5 falhas consecutivas abrem o circuito
          resetTimeoutMs: 30_000,      // Tenta novamente após 30 segundos
          halfOpenMaxRequests: 2,      // 2 requests de teste em half-open
          monitorIntervalMs: 10_000,   // Verifica métricas a cada 10s
          onStateChange: (from, to) => {
            this.logger.warn(`Circuit breaker ${provider}: ${from} → ${to}`);
            this.metricsService.recordCircuitBreakerChange(provider, from, to);
          },
        }),
      );
    }
  }

  isHealthy(provider: string): boolean {
    const breaker = this.breakers.get(provider);
    return breaker ? breaker.state !== 'OPEN' : false;
  }

  getBreaker(provider: string): CircuitBreaker {
    const breaker = this.breakers.get(provider);
    if (!breaker) throw new UnknownProviderError(provider);
    return breaker;
  }
}

// ai-gateway/src/resilience/provider-health-checker.ts
@Injectable()
export class ProviderHealthChecker {
  @Cron('*/30 * * * * *') // A cada 30 segundos
  async checkHealth(): Promise<void> {
    const providers = ['OPENAI', 'ANTHROPIC', 'OLLAMA'];

    const results = await Promise.allSettled(
      providers.map((p) => this.pingProvider(p)),
    );

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      const result = results[i];

      this.metricsService.recordHealthCheck(provider, {
        healthy: result.status === 'fulfilled',
        latencyMs: result.status === 'fulfilled' ? result.value.latencyMs : null,
        error: result.status === 'rejected' ? result.reason.message : null,
      });
    }
  }

  private async pingProvider(
    provider: string,
  ): Promise<{ latencyMs: number }> {
    const start = performance.now();
    await this.providerAdapters[provider].healthCheck();
    return { latencyMs: performance.now() - start };
  }
}
```

### 5. Rate Limiting por Tenant

```typescript
// ai-gateway/src/limiting/tenant-rate-limiter.ts
@Injectable()
export class TenantRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async assertWithinLimits(tenantId: string, feature: string): Promise<void> {
    const config = await this.getConfig(tenantId, feature);

    // Rate limit por minuto (sliding window)
    const minuteKey = `ai:ratelimit:${tenantId}:${feature}:rpm`;
    const currentRpm = await this.redis.incr(minuteKey);
    if (currentRpm === 1) await this.redis.expire(minuteKey, 60);

    if (currentRpm > config.maxRequestsPerMinute) {
      throw new AiRateLimitExceededError(tenantId, feature, 'RPM', config.maxRequestsPerMinute);
    }

    // Rate limit por dia
    const dayKey = `ai:ratelimit:${tenantId}:${feature}:rpd:${this.todayKey()}`;
    const currentRpd = await this.redis.incr(dayKey);
    if (currentRpd === 1) await this.redis.expire(dayKey, 86400);

    if (currentRpd > config.maxRequestsPerDay) {
      throw new AiRateLimitExceededError(tenantId, feature, 'RPD', config.maxRequestsPerDay);
    }
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
```

### 6. Schema de Banco — Regras de Roteamento e Cache

```sql
-- Regras de roteamento por tenant e feature
CREATE TABLE ai_routing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    feature             VARCHAR(50) NOT NULL,
    priority            INTEGER NOT NULL DEFAULT 0,
    provider            VARCHAR(50) NOT NULL,          -- OPENAI, ANTHROPIC, OLLAMA
    model_id            UUID REFERENCES ai_model_registry(id),
    quality_threshold   NUMERIC(3, 2) DEFAULT 0.70,   -- 0.00 a 1.00
    max_cost_per_request NUMERIC(8, 6),                -- em USD
    max_latency_ms      INTEGER,
    allowed_regions     TEXT[],                         -- ['us-east-1', 'eu-west-1']
    enabled             BOOLEAN DEFAULT true,
    conditions          JSONB DEFAULT '{}',            -- condições adicionais (horário, % tráfego)
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, feature, provider, priority)
);

CREATE INDEX idx_routing_rules_tenant_feature
    ON ai_routing_rules (tenant_id, feature, enabled, priority)
    WHERE enabled = true;

-- Cache semântico de respostas de IA
CREATE TABLE ai_cache_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    feature             VARCHAR(50) NOT NULL,
    prompt_hash         VARCHAR(64) NOT NULL,          -- SHA-256 do prompt original
    prompt_embedding    vector(1536) NOT NULL,         -- embedding para busca por similaridade
    original_prompt     TEXT NOT NULL,
    cached_response     JSONB NOT NULL,
    model_id            VARCHAR(100) NOT NULL,
    provider            VARCHAR(50) NOT NULL,
    input_tokens        INTEGER NOT NULL,
    output_tokens       INTEGER NOT NULL,
    hit_count           INTEGER DEFAULT 0,
    ttl_hours           INTEGER DEFAULT 24,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    status              VARCHAR(20) DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'EXPIRED', 'INVALIDATED'))
);

-- Índice para busca por similaridade semântica com isolamento por tenant
CREATE INDEX idx_cache_semantic_search
    ON ai_cache_entries USING hnsw (prompt_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_cache_tenant_feature
    ON ai_cache_entries (tenant_id, feature, status, expires_at)
    WHERE status = 'ACTIVE';

-- Índice para lookup exato por hash (quando prompt é idêntico)
CREATE UNIQUE INDEX idx_cache_exact_match
    ON ai_cache_entries (tenant_id, feature, prompt_hash)
    WHERE status = 'ACTIVE';

-- Cleanup de entradas expiradas (executado via pg_cron)
-- SELECT cron.schedule('cache-cleanup', '0 */6 * * *',
--   $$UPDATE ai_cache_entries SET status = 'EXPIRED'
--     WHERE status = 'ACTIVE' AND expires_at < NOW()$$);
```

### 7. Fluxo Completo de Roteamento

```
[Serviço] ---> [AI Gateway]
                 │
                 ├── 1. Rate Limit Check (Redis)
                 │     └── Tenant RPM/RPD dentro dos limites?
                 │
                 ├── 2. Semantic Cache Lookup (pgvector)
                 │     └── Prompt similar com similarity >= threshold?
                 │         ├── HIT  → Retorna resposta cacheada
                 │         └── MISS → Continua para seleção de modelo
                 │
                 ├── 3. Cost-Based Selection
                 │     ├── Obter regras de roteamento do tenant
                 │     ├── Filtrar modelos por qualidade mínima
                 │     ├── Verificar budget restante do tenant
                 │     └── Ordenar por custo-eficiência
                 │
                 ├── 4. Circuit Breaker Check
                 │     └── Filtrar providers com circuito aberto
                 │
                 ├── 5. Execute com Fallback Chain
                 │     ├── Provider 1 (melhor custo-eficiência)
                 │     ├── Provider 2 (fallback)
                 │     └── Provider N (último recurso)
                 │
                 ├── 6. Cache Response (pgvector)
                 │     └── Armazenar para futuras consultas similares
                 │
                 └── 7. Metering (ADR 021)
                       └── Registrar custo, latência, qualidade
```

## Consequências

### Positivas
- Fallback automático entre provedores elimina downtime causado por indisponibilidade de um único provider de IA.
- Cache semântico reduz custos de API de IA em 30-60% para workloads com prompts recorrentes (moderação, classificação).
- Roteamento por custo-eficiência garante que operações simples usem modelos baratos, reservando modelos premium para tarefas complexas.
- Rate limiting por tenant previne que um tenant monopolize a capacidade de IA da plataforma.
- Circuit breaker com health checks proporciona resiliência automática sem intervenção operacional.
- Compliance regional atendida via regras de roteamento que restringem providers por localização de dados.

### Negativas
- Complexidade significativa no AI Gateway — mais componentes para manter e testar.
- Cache semântico requer geração de embeddings adicionais para cada prompt (overhead de ~50ms).
- Estimativas de custo-eficiência baseadas em histórico podem ser imprecisas para features novas ou pouco utilizadas.
- Manutenção de regras de roteamento por tenant adiciona carga administrativa.
- Consistência de cache: invalidação de entradas cacheadas quando modelo é atualizado ou dados mudam.

## Implementação

- **ModelRouter** como orquestrador central dentro do serviço NestJS do AI Gateway (ADR 021).
- **SemanticCache** utilizando pgvector com índice HNSW para buscas de similaridade em < 10ms.
- **CostBasedSelector** alimentado por dados da tabela `ai_model_registry` (ADR 021) e histórico de qualidade.
- **CircuitBreakerRegistry** com implementação baseada em padrão Resilience4j, estado persistido no Redis.
- **ProviderHealthChecker** como cron job a cada 30s, reportando métricas para Grafana.
- **TenantRateLimiter** usando sliding window no Redis com chaves TTL automáticas.
- **pg_cron** para cleanup periódico de entradas expiradas na tabela `ai_cache_entries`.
- **Dashboard Grafana** com painéis: cache hit rate por feature, fallback rate por provider, custo por tenant/feature, latência de roteamento.

## Validação

- Teste de fallback: desabilitar provider primário e verificar que requisições são roteadas automaticamente para o próximo candidato em < 100ms.
- Teste de cache semântico: enviar prompts semanticamente similares (reformulações) e verificar cache hit com similarity >= 0.95.
- Teste de cost-based routing: configurar threshold de qualidade e verificar que modelo mais barato qualificado é selecionado.
- Teste de rate limiting: exceder RPM de tenant e verificar resposta 429 com header `Retry-After`.
- Teste de circuit breaker: simular 5 falhas consecutivas e verificar que circuito abre, e fecha após timeout.
- Teste de budget cap: exceder budget mensal de tenant e verificar que requisições são rejeitadas com erro claro.
- Teste de health check: verificar que provider com latência > threshold é marcado como degradado.
- Teste de cache invalidation: atualizar modelo e verificar que entradas de cache do modelo antigo são invalidadas.
- Benchmark de latência: overhead total do roteamento (sem chamada ao provider) < 20ms no p99.

## Referências

- ADR 021 — Governança de Shadow AI
- ADR 016 — Escalabilidade de Busca Vetorial para Features de IA
- ADR 017 — FinOps como Princípio Arquitetural
- ADR 013 — Trust Infrastructure
- REQ-AI-003 — Requisitos de Roteamento Inteligente de IA
