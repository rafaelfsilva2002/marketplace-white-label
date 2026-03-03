# ADR 021: Governança de Shadow AI

## Status

**Aceito** — Março 2026

## Contexto

Com a proliferação de APIs de IA generativa (OpenAI, Anthropic, Google, modelos open-source), existe um risco crescente de "Shadow AI" — uso não controlado de modelos de IA por diferentes serviços e times sem governança centralizada. Um serviço pode chamar GPT-4 diretamente, outro usa Claude, outro integra um modelo local — cada um com custos, latências, políticas de dados e qualidade de output distintos.

No contexto multi-tenant, o problema é agravado: dados de tenants podem ser enviados a provedores de IA sem consentimento adequado, custos de IA explodem sem visibilidade, e a qualidade das features de IA varia wildly entre serviços. Além disso, modelos de IA são atualizados por seus provedores sem aviso prévio, podendo alterar comportamento de features em produção.

A governança de Shadow AI é um requisito de compliance (LGPD Art. 20 — decisões automatizadas), segurança (dados sensíveis não devem sair para provedores sem controle) e financeiro (custos de API de IA podem facilmente ultrapassar custos de infraestrutura cloud).

## Decisão

Implementamos um **AI Gateway centralizado** pelo qual todas as chamadas a modelos de IA devem passar:

### 1. AI Gateway (Proxy Centralizado)

```typescript
// ai-gateway/src/gateway.service.ts
@Injectable()
export class AiGatewayService {
  async complete(request: AiRequest): Promise<AiResponse> {
    // 1. Verificar feature flag do tenant
    await this.featureFlags.assertEnabled(request.tenantId, `ai:${request.feature}`);

    // 2. Sanitizar dados sensíveis do prompt
    const sanitizedPrompt = await this.piiSanitizer.sanitize(request.prompt);

    // 3. Selecionar modelo baseado na política do tenant
    const model = await this.modelRouter.selectModel(request.tenantId, request.feature);

    // 4. Executar chamada com circuit breaker
    const response = await this.circuitBreaker.execute(() =>
      this.providers[model.provider].complete({
        model: model.modelId,
        prompt: sanitizedPrompt,
        maxTokens: model.maxTokens,
        temperature: model.temperature,
      })
    );

    // 5. Avaliar qualidade do output
    const qualityScore = await this.qualityMonitor.evaluate(response, request.feature);

    // 6. Registrar metering para billing
    await this.metering.record({
      tenantId: request.tenantId,
      feature: request.feature,
      model: model.modelId,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      latencyMs: response.latencyMs,
      qualityScore,
      cost: this.costCalculator.calculate(model, response.usage),
    });

    return response;
  }
}
```

### 2. Model Versioning e Pinning

```sql
CREATE TABLE ai_model_registry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(50) NOT NULL,  -- OPENAI, ANTHROPIC, LOCAL
    model_id        VARCHAR(100) NOT NULL, -- gpt-4-turbo-2024-04-09
    model_alias     VARCHAR(100) NOT NULL, -- gpt-4-turbo (alias estável)
    version         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, DEPRECATED, TESTING
    capabilities    JSONB NOT NULL,        -- max_tokens, supports_vision, etc.
    cost_per_1k_input   NUMERIC(8, 6),
    cost_per_1k_output  NUMERIC(8, 6),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_ai_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    feature         VARCHAR(50) NOT NULL,  -- SEARCH, MATCHING, RECOMMENDATIONS, MODERATION
    model_id        UUID REFERENCES ai_model_registry(id),
    enabled         BOOLEAN DEFAULT false,
    max_requests_per_day  INTEGER,
    max_cost_per_month    NUMERIC(10, 2),
    custom_system_prompt  TEXT,
    UNIQUE(tenant_id, feature)
);
```

### 3. Fluxo de Governança

```
[Serviço Qualquer] ---> [AI Gateway]
                          ├── Feature flag check
                          ├── PII sanitization
                          ├── Model routing
                          ├── Rate limiting per tenant
                          ├── Cost tracking
                          ├── Quality monitoring
                          └── Audit logging
                              ---> [Provider API]
```

### 4. Feature Flags de IA por Tenant

```typescript
interface TenantAiFeatureFlags {
  tenantId: string;
  features: {
    semanticSearch: boolean;
    smartMatching: boolean;
    recommendations: boolean;
    contentModeration: boolean;
    fraudDetection: boolean;
    chatAssistant: boolean;
  };
  globalKillSwitch: boolean; // desabilita todas as features de IA
}
```

### 5. Quality Monitoring

```typescript
interface AiQualityMetrics {
  feature: string;
  modelId: string;
  period: string;
  metrics: {
    avgLatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
    avgQualityScore: number;   // 0-1, baseado em heurísticas por feature
    hallucinationRate: number; // detectado via validação de output
    totalCost: number;
    requestCount: number;
  };
}
```

## Consequências

### Positivas
- Visibilidade total: todas as chamadas de IA rastreadas com custo, latência e qualidade.
- Sanitização de PII garante que dados sensíveis de tenants não vazam para provedores de IA.
- Model pinning previne surpresas quando provedores atualizam modelos sem aviso.
- Kill switch global e por tenant permite resposta rápida a problemas de qualidade ou custo.
- Custo de IA alocável por tenant, integrando com FinOps (ADR 017).

### Negativas
- Ponto único de falha: indisponibilidade do AI Gateway impacta todas as features de IA (mitigado com HA).
- Latência adicional: ~10-20ms de overhead por chamada para sanitização e logging.
- Complexidade de manter adapters para múltiplos provedores de IA.
- Resistência de desenvolvedores que preferem chamar APIs diretamente (mitigada via lint rules).

## Implementação

- **AI Gateway** como serviço NestJS dedicado, acessível apenas via rede interna.
- **Lint rule ESLint** bloqueia imports diretos de SDKs de IA (openai, @anthropic-ai/sdk) fora do gateway.
- **PII Sanitizer** usa regex patterns e NER leve para detectar e mascarar dados sensíveis.
- **Circuit breaker** (Resilience4j pattern) com fallback para modelo alternativo.
- **Dashboard Grafana** com painéis de custo por tenant, qualidade por modelo, latência por feature.
- **Alertas** para: custo diário > threshold, error rate > 5%, latência p99 > 3s.

## Validação

- Teste de bloqueio: serviço que tenta chamar API de IA diretamente sem passar pelo gateway é rejeitado.
- Teste de PII: prompts com CPF, email, telefone são sanitizados antes de enviar ao provedor.
- Teste de feature flag: desabilitar feature para tenant e verificar que chamadas retornam 403.
- Teste de cost cap: exceder limite mensal de custo e verificar throttling automático.
- Teste de failover: indisponibilidade do provedor primário aciona fallback para alternativo.
- Teste de qualidade: comparar outputs de versões diferentes do mesmo modelo.

## Emenda v1.1 — Expansão para AI Gateway Completo (Março 2026)

Este ADR estabeleceu a base do AI Gateway como mecanismo anti-Shadow AI. Com a adoção da arquitetura AI-Native (Artigo XI da Constituição), o gateway é expandido de governança reativa para plataforma proativa de IA:

### Funcionalidades Adicionadas (via ADRs 024-030)

| Funcionalidade | ADR | Status |
|---|---|---|
| Roteamento inteligente multi-provider com fallback | ADR-024 | Aceito |
| Cache semântico para prompts similares | ADR-024 | Aceito |
| Roteamento por custo/qualidade | ADR-024 | Aceito |
| Embedding sync automático via eventos | ADR-025 | Aceito |
| Métricas de qualidade e alucinação | ADR-026 | Aceito |
| A/B testing de modelos em produção | ADR-027 | Aceito |
| Runtime de agentes com gestão de estado | ADR-028 | Aceito |
| Decision delegation com autonomia gradual | ADR-029 | Aceito |
| Self-optimizing policies via feedback loop | ADR-030 | Aceito |

### Mudança de Escopo

- **Antes (v1.0)**: Gateway como proxy de governança — previne Shadow AI, sanitiza PII, aplica rate limits
- **Depois (v1.1)**: Gateway como plataforma AI-Native — além da governança, também orquestra roteamento inteligente, cache semântico, A/B testing, e alimenta métricas de qualidade

O ADR-021 permanece como a **decisão fundacional**. Os ADRs 024-030 são extensões que implementam as capacidades adicionais.

## Referências

- ADR 013 — Trust Infrastructure
- ADR 014 — Pricing Baseado em Outcomes (Emenda v1.1: Cost-per-AI-Operation)
- ADR 016 — Escalabilidade de Busca Vetorial (Emenda v1.1: Sync via Eventos)
- ADR 017 — FinOps como Princípio Arquitetural
- ADR 024 — AI Gateway Routing
- ADR 025 — Embeddings como Primeira Classe
- ADR 026 — Observabilidade de IA
- ADR 027 — A/B Testing de LLMs
- ADR 028 — Runtime de Agentes
- ADR 029 — Decision Delegation
- ADR 030 — Self-Optimizing Policies
- REQ-AI-002 — Requisitos de Governança de IA
