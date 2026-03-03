# ADR 030: Self-Optimizing Policies via Feedback Loop IA+OPA

## Status

**Aceito** — Março 2026

## Contexto

Políticas de negócio (pricing, moderação, matching, fraude) são tradicionalmente definidas manualmente por product managers e engenheiros, codificadas em regras estáticas, e atualizadas via deploy. Esse modelo é lento para reagir a mudanças de mercado, não aprende com outcomes, e não escala para múltiplos tenants com necessidades distintas.

No contexto multi-tenant, o problema é amplificado: uma regra de moderação que funciona para um marketplace de serviços profissionais pode ser inadequada para um marketplace de produtos artesanais. Cada tenant deveria ter políticas otimizadas para seu contexto específico — mas manter N conjuntos de políticas manualmente é inviável.

A arquitetura atual já possui os blocos necessários: OPA para Policy-as-Code (ADR-013), Observabilidade de IA para métricas de qualidade (ADR-026), Runtime de Agentes para execução autônoma (ADR-028) e Decision Delegation para autonomia gradual (ADR-029). O que falta é o **feedback loop**: coletar outcomes de decisões políticas, identificar padrões com IA, sugerir ajustes e aplicá-los de forma controlada.

Criticamente, a atualização de políticas **não é autônoma**: toda sugestão de mudança passa por um pipeline controlado com revisão humana obrigatória para mudanças acima de um threshold de impacto. O sistema propõe, o humano dispõe.

## Decisão

Implementamos um **feedback loop entre outcomes de negócio, análise por IA e políticas OPA**, criando um ciclo de otimização contínua com controle humano:

### 1. Modelo de Dados para Feedback de Políticas

```sql
CREATE TABLE policy_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    policy_domain       VARCHAR(100) NOT NULL,       -- MODERATION, PRICING, MATCHING, FRAUD
    policy_rule_id      VARCHAR(200) NOT NULL,       -- identificador da regra OPA (ex: "moderation.auto_approve")
    decision_id         UUID,                         -- referência à decisão que aplicou a política
    input_context       JSONB NOT NULL,               -- contexto que foi avaliado pela política
    policy_output       JSONB NOT NULL,               -- resultado da avaliação da política
    actual_outcome      VARCHAR(50),                  -- POSITIVE, NEGATIVE, NEUTRAL
    outcome_details     JSONB,                        -- detalhes do outcome (ex: chargeback, dispute, success)
    outcome_value       NUMERIC(10, 2),               -- valor financeiro do outcome (se aplicável)
    feedback_source     VARCHAR(50) NOT NULL,          -- AUTOMATED, HUMAN_REVIEW, USER_REPORT, OUTCOME_BASED
    is_policy_correct   BOOLEAN,                      -- a política tomou a decisão certa?
    feedback_notes      TEXT,
    collected_at        TIMESTAMPTZ DEFAULT NOW(),
    outcome_at          TIMESTAMPTZ                    -- quando o outcome foi observado
);

CREATE TABLE policy_suggestions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    policy_domain       VARCHAR(100) NOT NULL,
    policy_rule_id      VARCHAR(200) NOT NULL,
    suggestion_type     VARCHAR(50) NOT NULL,          -- THRESHOLD_ADJUST, NEW_RULE, RULE_REMOVAL, PARAMETER_TUNE
    current_value       JSONB NOT NULL,                -- valor/regra atual
    suggested_value     JSONB NOT NULL,                -- valor/regra sugerida
    reasoning           TEXT NOT NULL,                  -- raciocínio da IA (chain-of-thought)
    evidence            JSONB NOT NULL,                -- dados que suportam a sugestão
    expected_impact     JSONB NOT NULL,                -- impacto estimado (% de decisões afetadas, custo, etc.)
    confidence          NUMERIC(5, 4) NOT NULL,
    impact_level        VARCHAR(20) NOT NULL,           -- LOW, MEDIUM, HIGH, CRITICAL
    status              VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, APPLIED, ROLLED_BACK
    reviewed_by         UUID,
    review_notes        TEXT,
    reviewed_at         TIMESTAMPTZ,
    applied_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE policy_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    policy_domain       VARCHAR(100) NOT NULL,
    policy_rule_id      VARCHAR(200) NOT NULL,
    version             INTEGER NOT NULL,
    policy_content      TEXT NOT NULL,                  -- conteúdo da política (Rego ou JSON config)
    policy_hash         VARCHAR(128) NOT NULL,          -- SHA-256 do conteúdo
    change_type         VARCHAR(50) NOT NULL,           -- MANUAL, AI_SUGGESTED, ROLLBACK
    suggestion_id       UUID REFERENCES policy_suggestions(id),
    applied_by          UUID NOT NULL,                  -- quem aplicou (humano)
    rollback_of         UUID REFERENCES policy_versions(id),
    is_active           BOOLEAN DEFAULT true,
    performance_metrics JSONB,                          -- métricas pós-aplicação
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, policy_domain, policy_rule_id, version)
);

CREATE INDEX idx_policy_feedback_tenant ON policy_feedback(tenant_id, policy_domain);
CREATE INDEX idx_policy_feedback_outcome ON policy_feedback(actual_outcome, is_policy_correct);
CREATE INDEX idx_policy_suggestions_pending ON policy_suggestions(status)
    WHERE status = 'PENDING';
CREATE INDEX idx_policy_versions_active ON policy_versions(tenant_id, policy_domain, is_active)
    WHERE is_active = true;
```

### 2. Coletor de Feedback

```typescript
// packages/ai-gateway/src/policies/feedback-collector.ts
import { Injectable, Logger } from '@nestjs/common';

interface PolicyOutcome {
  tenantId: string;
  policyDomain: string;
  policyRuleId: string;
  decisionId?: string;
  inputContext: Record<string, unknown>;
  policyOutput: Record<string, unknown>;
  actualOutcome: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  outcomeDetails?: Record<string, unknown>;
  outcomeValue?: number;
  feedbackSource: 'AUTOMATED' | 'HUMAN_REVIEW' | 'USER_REPORT' | 'OUTCOME_BASED';
  isPolicyCorrect?: boolean;
  notes?: string;
}

@Injectable()
export class FeedbackCollector {
  private readonly logger = new Logger(FeedbackCollector.name);

  constructor(
    private readonly feedbackRepo: PolicyFeedbackRepository,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Registra feedback de uma decisão de política.
   * Chamado por múltiplas fontes:
   * - Outcome-based: após observar resultado real (ex: transação com chargeback)
   * - Human review: moderador humano avalia decisão da política
   * - User report: usuário reporta problema (ex: listing inapropriado aprovado)
   * - Automated: sistema detecta inconsistência (ex: fraude confirmada)
   */
  async collect(outcome: PolicyOutcome): Promise<string> {
    const feedback = await this.feedbackRepo.create({
      tenantId: outcome.tenantId,
      policyDomain: outcome.policyDomain,
      policyRuleId: outcome.policyRuleId,
      decisionId: outcome.decisionId,
      inputContext: outcome.inputContext,
      policyOutput: outcome.policyOutput,
      actualOutcome: outcome.actualOutcome,
      outcomeDetails: outcome.outcomeDetails,
      outcomeValue: outcome.outcomeValue,
      feedbackSource: outcome.feedbackSource,
      isPolicyCorrect: outcome.isPolicyCorrect,
      feedbackNotes: outcome.notes,
      outcomeAt: new Date(),
    });

    // Emitir evento para pipeline de análise
    await this.eventBus.emit('policy.feedback.collected', {
      feedbackId: feedback.id,
      tenantId: outcome.tenantId,
      policyDomain: outcome.policyDomain,
      policyRuleId: outcome.policyRuleId,
      isPolicyCorrect: outcome.isPolicyCorrect,
    });

    this.logger.log(
      `Feedback coletado: ${outcome.policyDomain}/${outcome.policyRuleId} ` +
      `outcome=${outcome.actualOutcome} correct=${outcome.isPolicyCorrect}`,
    );

    return feedback.id;
  }

  /**
   * Coleta automática baseada em outcomes de negócio.
   * Integra com eventos do sistema para detectar outcomes automaticamente.
   */
  async collectFromBusinessEvent(event: BusinessEvent): Promise<void> {
    const mappings = this.getEventPolicyMappings(event.type);

    for (const mapping of mappings) {
      await this.collect({
        tenantId: event.tenantId,
        policyDomain: mapping.domain,
        policyRuleId: mapping.ruleId,
        inputContext: event.context,
        policyOutput: event.originalPolicyDecision,
        actualOutcome: mapping.deriveOutcome(event),
        outcomeDetails: event.details,
        outcomeValue: event.value,
        feedbackSource: 'OUTCOME_BASED',
        isPolicyCorrect: mapping.isPolicyCorrect(event),
      });
    }
  }

  /**
   * Mapeia eventos de negócio para políticas relevantes.
   */
  private getEventPolicyMappings(eventType: string): PolicyEventMapping[] {
    const mappings: Record<string, PolicyEventMapping[]> = {
      'transaction.chargeback': [{
        domain: 'FRAUD',
        ruleId: 'fraud.transaction_risk_assessment',
        deriveOutcome: () => 'NEGATIVE',
        isPolicyCorrect: (event) => event.originalPolicyDecision?.blocked === true,
      }],
      'listing.reported': [{
        domain: 'MODERATION',
        ruleId: 'moderation.listing_approval',
        deriveOutcome: (event) => event.details.reportConfirmed ? 'NEGATIVE' : 'NEUTRAL',
        isPolicyCorrect: (event) => !event.details.reportConfirmed,
      }],
      'match.successful': [{
        domain: 'MATCHING',
        ruleId: 'matching.quality_threshold',
        deriveOutcome: () => 'POSITIVE',
        isPolicyCorrect: () => true,
      }],
      'match.rejected_by_user': [{
        domain: 'MATCHING',
        ruleId: 'matching.quality_threshold',
        deriveOutcome: () => 'NEGATIVE',
        isPolicyCorrect: () => false,
      }],
    };

    return mappings[eventType] ?? [];
  }
}
```

### 3. Analisador de Políticas (LLM-Powered)

```typescript
// packages/ai-gateway/src/policies/policy-analyzer.ts
import { Injectable, Logger } from '@nestjs/common';

interface AnalysisResult {
  patterns: Pattern[];
  suggestions: PolicySuggestion[];
  summary: string;
}

interface Pattern {
  description: string;
  feedbackIds: string[];
  frequency: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface PolicySuggestion {
  policyRuleId: string;
  suggestionType: 'THRESHOLD_ADJUST' | 'NEW_RULE' | 'RULE_REMOVAL' | 'PARAMETER_TUNE';
  currentValue: Record<string, unknown>;
  suggestedValue: Record<string, unknown>;
  reasoning: string;
  evidence: Record<string, unknown>;
  expectedImpact: Record<string, unknown>;
  confidence: number;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class PolicyAnalyzer {
  private readonly logger = new Logger(PolicyAnalyzer.name);

  constructor(
    private readonly feedbackRepo: PolicyFeedbackRepository,
    private readonly suggestionRepo: PolicySuggestionRepository,
    private readonly aiGateway: AiGatewayService,
    private readonly policyRegistry: PolicyRegistryService,
  ) {}

  /**
   * Analisa feedback acumulado para um domínio de política de um tenant.
   * Executada via cron semanal ou quando volume de feedback negativo excede threshold.
   */
  async analyze(
    tenantId: string,
    policyDomain: string,
  ): Promise<AnalysisResult> {
    // 1. Coletar feedback recente (últimos 30 dias)
    const feedback = await this.feedbackRepo.findRecent(tenantId, policyDomain, 30);

    if (feedback.length < 50) {
      this.logger.log(`Feedback insuficiente para análise: ${feedback.length}/50`);
      return { patterns: [], suggestions: [], summary: 'Dados insuficientes para análise.' };
    }

    // 2. Agregar estatísticas por regra
    const ruleStats = this.aggregateByRule(feedback);

    // 3. Carregar políticas atuais do domínio
    const currentPolicies = await this.policyRegistry.getPolicies(tenantId, policyDomain);

    // 4. Enviar para LLM para análise de padrões
    const analysisPrompt = this.buildAnalysisPrompt(ruleStats, currentPolicies, policyDomain);

    const llmResponse = await this.aiGateway.complete({
      tenantId,
      feature: 'policy_optimization',
      prompt: analysisPrompt,
      systemPrompt: this.getSystemPrompt(),
    });

    // 5. Parsear resposta estruturada
    const analysis = this.parseAnalysis(llmResponse.content);

    // 6. Persistir sugestões
    for (const suggestion of analysis.suggestions) {
      await this.suggestionRepo.create({
        tenantId,
        policyDomain,
        policyRuleId: suggestion.policyRuleId,
        suggestionType: suggestion.suggestionType,
        currentValue: suggestion.currentValue,
        suggestedValue: suggestion.suggestedValue,
        reasoning: suggestion.reasoning,
        evidence: suggestion.evidence,
        expectedImpact: suggestion.expectedImpact,
        confidence: suggestion.confidence,
        impactLevel: suggestion.impactLevel,
      });
    }

    this.logger.log(
      `Análise concluída para ${policyDomain}/${tenantId}: ` +
      `${analysis.patterns.length} padrões, ${analysis.suggestions.length} sugestões`,
    );

    return analysis;
  }

  private buildAnalysisPrompt(
    ruleStats: Map<string, RuleStatistics>,
    currentPolicies: PolicyConfig[],
    domain: string,
  ): string {
    const statsJson = Object.fromEntries(
      Array.from(ruleStats.entries()).map(([ruleId, stats]) => [ruleId, {
        totalDecisions: stats.total,
        correctDecisions: stats.correct,
        accuracy: (stats.correct / stats.total * 100).toFixed(1) + '%',
        falsePositives: stats.falsePositives,
        falseNegatives: stats.falseNegatives,
        avgOutcomeValue: stats.avgOutcomeValue.toFixed(2),
        negativeOutcomes: stats.negativeOutcomes,
      }]),
    );

    return [
      `## Análise de Políticas: ${domain}`,
      ``,
      `### Estatísticas por Regra (últimos 30 dias)`,
      '```json',
      JSON.stringify(statsJson, null, 2),
      '```',
      ``,
      `### Políticas Atuais`,
      '```json',
      JSON.stringify(currentPolicies, null, 2),
      '```',
      ``,
      `### Instruções`,
      `Analise os dados acima e:`,
      `1. Identifique padrões de falha nas políticas (falsos positivos/negativos recorrentes)`,
      `2. Sugira ajustes específicos com valores concretos`,
      `3. Para cada sugestão, forneça: reasoning, evidence, expectedImpact, confidence, impactLevel`,
      `4. Responda em JSON: { patterns: [...], suggestions: [...], summary: "..." }`,
      `5. Seja conservador: só sugira mudanças com confidence >= 0.7 e evidência sólida`,
    ].join('\n');
  }

  private getSystemPrompt(): string {
    return [
      'Você é um analista de políticas de negócio especializado em marketplaces.',
      'Sua função é identificar padrões em dados de feedback e sugerir ajustes em políticas.',
      'Seja conservador: prefira mudanças pequenas e incrementais a reformas radicais.',
      'Toda sugestão deve ser acompanhada de evidência quantitativa.',
      'Responda SEMPRE em JSON estruturado.',
    ].join(' ');
  }

  private aggregateByRule(feedback: PolicyFeedback[]): Map<string, RuleStatistics> {
    const stats = new Map<string, RuleStatistics>();

    for (const f of feedback) {
      const existing = stats.get(f.policyRuleId) ?? {
        total: 0, correct: 0, falsePositives: 0,
        falseNegatives: 0, avgOutcomeValue: 0,
        totalOutcomeValue: 0, negativeOutcomes: 0,
      };

      existing.total++;
      if (f.isPolicyCorrect) existing.correct++;
      if (f.actualOutcome === 'NEGATIVE' && f.isPolicyCorrect === false) {
        existing.falseNegatives++; // política disse OK mas outcome foi negativo
      }
      if (f.actualOutcome === 'POSITIVE' && f.isPolicyCorrect === false) {
        existing.falsePositives++; // política bloqueou mas outcome seria positivo
      }
      if (f.outcomeValue) existing.totalOutcomeValue += Number(f.outcomeValue);
      if (f.actualOutcome === 'NEGATIVE') existing.negativeOutcomes++;

      existing.avgOutcomeValue = existing.totalOutcomeValue / existing.total;
      stats.set(f.policyRuleId, existing);
    }

    return stats;
  }

  private parseAnalysis(content: string): AnalysisResult {
    try {
      return JSON.parse(content) as AnalysisResult;
    } catch {
      this.logger.warn('Falha ao parsear resposta da IA — retornando vazio');
      return { patterns: [], suggestions: [], summary: 'Erro ao processar análise.' };
    }
  }
}
```

### 4. Pipeline de Atualização de Políticas

```typescript
// packages/ai-gateway/src/policies/policy-update-pipeline.ts
import { Injectable, Logger } from '@nestjs/common';

interface PipelineResult {
  applied: boolean;
  versionId?: string;
  reason: string;
}

@Injectable()
export class PolicyUpdatePipeline {
  private readonly logger = new Logger(PolicyUpdatePipeline.name);

  // Mudanças com impactLevel acima deste threshold requerem revisão humana
  private readonly AUTO_APPLY_MAX_IMPACT = 'LOW';

  constructor(
    private readonly suggestionRepo: PolicySuggestionRepository,
    private readonly versionRepo: PolicyVersionRepository,
    private readonly policyRegistry: PolicyRegistryService,
    private readonly opaClient: OpaClientService,
    private readonly notifier: NotificationService,
    private readonly auditService: AuditService,
    private readonly abTestRouter: AbTestRouter,
  ) {}

  /**
   * Processa uma sugestão aprovada e aplica a mudança na política.
   * Fluxo: Sugestão → Validação → Versionamento → Teste → Aplicação → Monitoramento
   */
  async applySuggestion(
    suggestionId: string,
    approvedBy: string,
  ): Promise<PipelineResult> {
    const suggestion = await this.suggestionRepo.findById(suggestionId);

    // 1. Validar que a sugestão foi revisada e aprovada
    if (suggestion.status !== 'APPROVED') {
      return { applied: false, reason: `Sugestão não está aprovada (status=${suggestion.status})` };
    }

    // 2. Carregar versão atual da política
    const currentVersion = await this.versionRepo.findActive(
      suggestion.tenantId,
      suggestion.policyDomain,
      suggestion.policyRuleId,
    );

    // 3. Gerar nova versão da política
    const newPolicyContent = await this.generatePolicyContent(suggestion, currentVersion);

    // 4. Validar sintaxe da política (dry-run no OPA)
    const validation = await this.opaClient.validate(newPolicyContent);
    if (!validation.valid) {
      this.logger.error(`Política inválida: ${validation.errors}`);
      await this.suggestionRepo.updateStatus(suggestionId, 'REJECTED', {
        reviewNotes: `Erro de validação OPA: ${validation.errors.join(', ')}`,
      });
      return { applied: false, reason: `Política inválida: ${validation.errors}` };
    }

    // 5. Criar nova versão
    const newVersion = await this.versionRepo.create({
      tenantId: suggestion.tenantId,
      policyDomain: suggestion.policyDomain,
      policyRuleId: suggestion.policyRuleId,
      version: (currentVersion?.version ?? 0) + 1,
      policyContent: newPolicyContent,
      policyHash: this.hash(newPolicyContent),
      changeType: 'AI_SUGGESTED',
      suggestionId: suggestion.id,
      appliedBy: approvedBy,
    });

    // 6. Desativar versão anterior
    if (currentVersion) {
      await this.versionRepo.deactivate(currentVersion.id);
    }

    // 7. Aplicar no OPA
    await this.opaClient.updatePolicy(
      suggestion.tenantId,
      suggestion.policyDomain,
      suggestion.policyRuleId,
      newPolicyContent,
    );

    // 8. Registrar na sugestão
    await this.suggestionRepo.updateStatus(suggestionId, 'APPLIED');

    // 9. Audit trail
    await this.auditService.record({
      tenantId: suggestion.tenantId,
      action: 'POLICY_UPDATED_VIA_AI_SUGGESTION',
      entityType: 'policy_version',
      entityId: newVersion.id,
      metadata: {
        domain: suggestion.policyDomain,
        ruleId: suggestion.policyRuleId,
        suggestionId,
        version: newVersion.version,
        changeType: suggestion.suggestionType,
        approvedBy,
      },
    });

    // 10. Notificar
    await this.notifier.send({
      channel: 'policy-updates',
      tenantId: suggestion.tenantId,
      severity: 'INFO',
      title: `Política atualizada: ${suggestion.policyDomain}/${suggestion.policyRuleId}`,
      body: `Versão ${newVersion.version} aplicada. Motivo: ${suggestion.reasoning.substring(0, 200)}`,
    });

    this.logger.log(
      `Política aplicada: ${suggestion.policyDomain}/${suggestion.policyRuleId} v${newVersion.version}`,
    );

    return { applied: true, versionId: newVersion.id, reason: 'Política aplicada com sucesso' };
  }

  /**
   * Reverte para a versão anterior de uma política.
   */
  async rollback(
    tenantId: string,
    policyDomain: string,
    policyRuleId: string,
    rolledBackBy: string,
    reason: string,
  ): Promise<PipelineResult> {
    const currentVersion = await this.versionRepo.findActive(tenantId, policyDomain, policyRuleId);
    if (!currentVersion || currentVersion.version <= 1) {
      return { applied: false, reason: 'Sem versão anterior para rollback' };
    }

    // Buscar versão anterior
    const previousVersion = await this.versionRepo.findByVersion(
      tenantId, policyDomain, policyRuleId, currentVersion.version - 1,
    );

    if (!previousVersion) {
      return { applied: false, reason: 'Versão anterior não encontrada' };
    }

    // Criar nova versão (rollback é uma nova versão que aponta para a anterior)
    const rollbackVersion = await this.versionRepo.create({
      tenantId,
      policyDomain,
      policyRuleId,
      version: currentVersion.version + 1,
      policyContent: previousVersion.policyContent,
      policyHash: previousVersion.policyHash,
      changeType: 'ROLLBACK',
      rollbackOf: currentVersion.id,
      appliedBy: rolledBackBy,
    });

    // Desativar versão atual
    await this.versionRepo.deactivate(currentVersion.id);

    // Aplicar no OPA
    await this.opaClient.updatePolicy(tenantId, policyDomain, policyRuleId, previousVersion.policyContent);

    // Marcar sugestão como rolled_back (se aplicável)
    if (currentVersion.suggestionId) {
      await this.suggestionRepo.updateStatus(currentVersion.suggestionId, 'ROLLED_BACK');
    }

    // Audit trail
    await this.auditService.record({
      tenantId,
      action: 'POLICY_ROLLED_BACK',
      entityType: 'policy_version',
      entityId: rollbackVersion.id,
      metadata: {
        domain: policyDomain,
        ruleId: policyRuleId,
        rolledBackVersion: currentVersion.version,
        restoredVersion: previousVersion.version,
        reason,
        rolledBackBy,
      },
    });

    this.logger.warn(
      `Rollback: ${policyDomain}/${policyRuleId} v${currentVersion.version} → v${previousVersion.version}. Motivo: ${reason}`,
    );

    return { applied: true, versionId: rollbackVersion.id, reason: 'Rollback realizado com sucesso' };
  }

  /**
   * Processa sugestões pendentes: aplica automaticamente as de baixo impacto,
   * e envia para revisão humana as demais.
   */
  async processPendingSuggestions(): Promise<void> {
    const pending = await this.suggestionRepo.findByStatus('PENDING');

    for (const suggestion of pending) {
      if (this.canAutoApply(suggestion)) {
        // Baixo impacto e alta confiança → aprovar e aplicar automaticamente
        await this.suggestionRepo.updateStatus(suggestion.id, 'APPROVED', {
          reviewedBy: 'SYSTEM_AUTO_APPROVE',
          reviewNotes: 'Auto-aprovado: baixo impacto e alta confiança',
        });
        await this.applySuggestion(suggestion.id, 'SYSTEM_AUTO_APPROVE');
      } else {
        // Enviar para revisão humana
        await this.notifier.send({
          channel: 'policy-reviews',
          tenantId: suggestion.tenantId,
          severity: suggestion.impactLevel === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          title: `Sugestão de política requer revisão: ${suggestion.policyDomain}`,
          body: [
            `**Regra**: ${suggestion.policyRuleId}`,
            `**Tipo**: ${suggestion.suggestionType}`,
            `**Impacto**: ${suggestion.impactLevel}`,
            `**Confiança**: ${(suggestion.confidence * 100).toFixed(1)}%`,
            `**Raciocínio**: ${suggestion.reasoning.substring(0, 300)}`,
          ].join('\n'),
          actions: [
            { label: 'Aprovar', action: `approve-suggestion:${suggestion.id}` },
            { label: 'Rejeitar', action: `reject-suggestion:${suggestion.id}` },
            { label: 'Revisar', action: `review-suggestion:${suggestion.id}` },
          ],
        });
      }
    }
  }

  private canAutoApply(suggestion: PolicySuggestion): boolean {
    return (
      suggestion.impactLevel === 'LOW' &&
      suggestion.confidence >= 0.90 &&
      suggestion.suggestionType === 'PARAMETER_TUNE'
    );
  }

  private async generatePolicyContent(
    suggestion: PolicySuggestion,
    currentVersion: PolicyVersion | null,
  ): Promise<string> {
    // Para ajustes de threshold/parâmetro, modificar JSON config
    if (suggestion.suggestionType === 'THRESHOLD_ADJUST' || suggestion.suggestionType === 'PARAMETER_TUNE') {
      const currentConfig = currentVersion
        ? JSON.parse(currentVersion.policyContent)
        : {};

      const updatedConfig = {
        ...currentConfig,
        ...suggestion.suggestedValue,
        _metadata: {
          updatedAt: new Date().toISOString(),
          suggestionId: suggestion.id,
          previousValue: suggestion.currentValue,
        },
      };

      return JSON.stringify(updatedConfig, null, 2);
    }

    // Para novas regras ou remoções, retornar conteúdo Rego
    return JSON.stringify(suggestion.suggestedValue, null, 2);
  }

  private hash(content: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256').update(content).digest('hex');
  }
}
```

### 5. Fluxo Completo do Feedback Loop

```
[Decisão de Política] → [Outcome Observado]
         │                      │
         └──────────┬───────────┘
                    │
         FeedbackCollector.collect()
                    │
         [policy_feedback table]
                    │
         PolicyAnalyzer.analyze() (cron semanal)
                    │
         ┌──────────┴──────────┐
         │ Padrões Identificados│
         │ Sugestões Geradas   │
         └──────────┬──────────┘
                    │
         [policy_suggestions table]
                    │
         PolicyUpdatePipeline.processPendingSuggestions()
                    │
         ┌──────────┴──────────┐
         │                     │
    [Baixo Impacto]      [Médio/Alto Impacto]
    Auto-apply            Revisão Humana
         │                     │
         └──────────┬──────────┘
                    │
         applySuggestion()
                    │
         ┌──────────┴──────────┐
         │ Validar no OPA      │
         │ Versionar            │
         │ Aplicar              │
         │ Audit Trail          │
         │ Monitorar            │
         └─────────────────────┘
                    │
         [Novos outcomes] → [FeedbackCollector] → ... (loop contínuo)
```

## Consequências

### Positivas
- Políticas evoluem com base em dados reais de outcomes, não em intuição ou benchmarks genéricos.
- Per-tenant: cada tenant tem políticas otimizadas para seu contexto específico.
- Versionamento completo: toda mudança de política é rastreável, com diff, razão e responsável.
- Rollback instantâneo: se uma mudança de política piora performance, pode ser revertida em segundos.
- Controle humano: mudanças de alto impacto sempre passam por revisão humana — o sistema propõe, humano dispõe.
- Feedback loop fechado: outcomes alimentam análise que alimenta políticas que geram novos outcomes.
- Integração com FinOps (ADR-017): políticas de pricing otimizadas reduzem churn e aumentam LTV.

### Negativas
- Complexidade significativa: feedback loop com IA, OPA, versionamento e rollback é um sistema complexo.
- Dependência de qualidade de feedback: se outcomes são mal classificados, sugestões serão enviesadas.
- Latência do loop: de outcome observado até política ajustada pode levar 1-4 semanas (cron semanal + revisão humana).
- Custo de IA: análise semanal por tenant por domínio de política consome tokens de LLM.
- Risco de overfitting: otimizar demais para dados recentes pode criar políticas frágeis (mitigado com janela de 30 dias e conservadorismo na IA).
- Resistência de stakeholders: "a IA está mudando as regras do negócio" requer educação e transparência.

## Implementação

- **FeedbackCollector** como listener de eventos de negócio no message bus (Redis Streams / BullMQ).
- **PolicyAnalyzer** executado via cron semanal (BullMQ) ou sob demanda quando taxa de feedback negativo excede 20%.
- **PolicyUpdatePipeline** com API REST para aprovar/rejeitar sugestões e executar rollbacks.
- **Dashboard** por tenant: visualização de feedback acumulado, sugestões pendentes, histórico de versões, métricas pré/pós mudança.
- **OPA Bundle Server** atualizado automaticamente quando políticas são aplicadas.
- **Canary deploy de políticas**: opcionalmente, nova política pode ser aplicada a 10% do tráfego antes de full rollout (reusa infra de A/B testing ADR-027).
- **Alertas Grafana**: taxa de outcomes negativos > threshold, rollback automático se política nova piora métricas em > 10%.

## Validação

- Teste de coleta: evento de chargeback gera feedback automatizado na tabela `policy_feedback`.
- Teste de análise: com 100+ feedbacks negativos, PolicyAnalyzer gera pelo menos 1 sugestão.
- Teste de auto-apply: sugestão de baixo impacto com confiança >= 90% é aplicada automaticamente.
- Teste de revisão humana: sugestão de alto impacto fica pendente até aprovação.
- Teste de versionamento: aplicar sugestão incrementa versão e registra diff.
- Teste de rollback: reverter política restaura conteúdo da versão anterior.
- Teste de validação OPA: política com sintaxe Rego inválida é rejeitada antes de aplicação.
- Teste de audit trail: toda mudança de política aparece no audit trail com responsável e razão.
- Teste de feedback loop: outcome negativo → feedback → análise → sugestão → aplicação → melhoria mensurável.
- Teste multi-tenant: política otimizada no tenant A não afeta políticas do tenant B.

## Referências

- ADR 029 — Decision Delegation: Autonomia Gradual para Agentes
- ADR 028 — Runtime de Agentes com Gestão de Estado
- ADR 013 — Trust Infrastructure (OPA / Policy-as-Code)
- ADR 026 — Observabilidade de IA: Métricas de Alucinação e Qualidade
- ADR 027 — A/B Testing de LLMs em Produção
- ADR 017 — FinOps como Princípio Arquitetural
- ADR 014 — Pricing Baseado em Outcomes
- REQ-AI-006 — Requisitos de Políticas Auto-Otimizáveis
