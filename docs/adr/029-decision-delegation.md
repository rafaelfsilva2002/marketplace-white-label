# ADR 029: Decision Delegation — Autonomia Gradual para Agentes

## Status

**Aceito** — Março 2026

## Contexto

O runtime de agentes (ADR-028) implementa human-in-the-loop obrigatório para ações destrutivas e financeiras. Isso garante segurança, mas cria um gargalo operacional: à medida que os agentes processam mais tarefas, o volume de decisões pendentes de aprovação humana cresce exponencialmente. Um marketplace com 10.000 listagens/dia pode gerar centenas de decisões de moderação que exigem revisão manual.

A solução não é remover a supervisão humana, mas graduá-la: agentes que demonstram acurácia consistente em decisões de um tipo específico podem receber autonomia incremental. Um agente de moderação que acerta 98% das decisões de aprovação de listagens em um tenant pode ser promovido para decidir autonomamente dentro de um threshold de confiança, enquanto mantém human-in-the-loop para tipos de decisão onde ainda erra.

Esse modelo segue o princípio de "confiança conquistada": autonomia não é concedida por configuração estática, mas é calculada dinamicamente com base no histórico de acurácia do agente para cada tipo de decisão e para cada tenant. Se a acurácia cair, a autonomia é automaticamente reduzida.

A integração com Trust Infrastructure (ADR-013) garante que todas as decisões delegadas — tanto as autônomas quanto as supervisionadas — são registradas em audit trail com rastreabilidade completa. A Observabilidade de IA (ADR-026) fornece métricas de qualidade que alimentam o cálculo de confiança.

## Decisão

Implementamos um **sistema de delegação de decisões com níveis crescentes de autonomia**, onde a promoção e regressão de nível são baseadas em acurácia histórica:

### 1. Modelo de Dados para Delegação

```sql
CREATE TABLE delegation_config (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    agent_type          VARCHAR(100) NOT NULL,       -- MODERATION, FRAUD_ANALYSIS, PRICING, etc.
    decision_type       VARCHAR(100) NOT NULL,       -- APPROVE_LISTING, BLOCK_USER, ADJUST_PRICE, etc.
    current_level       INTEGER NOT NULL DEFAULT 0,  -- 0, 1 ou 2
    confidence_threshold NUMERIC(5, 4) DEFAULT 0.9000, -- threshold para ação autônoma (nível 2)
    min_decisions_for_promotion INTEGER DEFAULT 100,   -- mínimo de decisões para avaliar promoção
    accuracy_threshold_promote NUMERIC(5, 4) DEFAULT 0.9500, -- acurácia mínima para promoção
    accuracy_threshold_regress NUMERIC(5, 4) DEFAULT 0.8500, -- acurácia abaixo = regressão
    evaluation_window_days INTEGER DEFAULT 30,        -- janela de avaliação de acurácia
    max_autonomous_value NUMERIC(10, 2),              -- valor máximo para decisão autônoma (ex: R$500)
    enabled             BOOLEAN DEFAULT true,
    last_evaluated_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, agent_type, decision_type)
);

CREATE TABLE delegation_decisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    agent_type          VARCHAR(100) NOT NULL,
    decision_type       VARCHAR(100) NOT NULL,
    execution_id        UUID REFERENCES agent_executions(id),
    delegation_level    INTEGER NOT NULL,              -- nível usado na decisão
    confidence          NUMERIC(5, 4) NOT NULL,        -- confiança do agente
    decision_value      NUMERIC(10, 2),                -- valor financeiro envolvido (se aplicável)
    agent_decision      VARCHAR(50) NOT NULL,           -- APPROVE, REJECT, ESCALATE, etc.
    was_autonomous      BOOLEAN NOT NULL,               -- true = agente decidiu sem humano
    human_override      BOOLEAN DEFAULT false,          -- true = humano alterou a decisão
    human_decision      VARCHAR(50),                    -- decisão do humano (se diferente)
    human_reviewer      UUID,
    is_correct          BOOLEAN,                        -- preenchido após feedback/outcome
    correctness_source  VARCHAR(50),                    -- HUMAN_REVIEW, OUTCOME_BASED, AUTOMATED
    feedback_at         TIMESTAMPTZ,
    chain_of_thought    TEXT NOT NULL,
    metadata            JSONB DEFAULT '{}',
    decided_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE delegation_accuracy (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    agent_type          VARCHAR(100) NOT NULL,
    decision_type       VARCHAR(100) NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    total_decisions     INTEGER NOT NULL,
    correct_decisions   INTEGER NOT NULL,
    autonomous_decisions INTEGER NOT NULL,
    human_overrides     INTEGER NOT NULL,
    accuracy            NUMERIC(5, 4) NOT NULL,        -- correct / total
    autonomous_accuracy NUMERIC(5, 4),                 -- acurácia apenas de decisões autônomas
    level_at_period     INTEGER NOT NULL,
    level_changed       BOOLEAN DEFAULT false,
    level_change_direction VARCHAR(10),                 -- PROMOTED, REGRESSED, ou NULL
    calculated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, agent_type, decision_type, period_start)
);

CREATE INDEX idx_delegation_decisions_tenant ON delegation_decisions(tenant_id, agent_type, decision_type);
CREATE INDEX idx_delegation_decisions_pending ON delegation_decisions(is_correct)
    WHERE is_correct IS NULL;
CREATE INDEX idx_delegation_config_tenant ON delegation_config(tenant_id, agent_type);
```

### 2. Engine de Delegação de Decisões

```typescript
// packages/ai-gateway/src/delegation/decision-delegation-engine.ts
import { Injectable, Logger } from '@nestjs/common';

enum AutonomyLevel {
  SUGGEST = 0,      // Agente sugere, humano decide
  CONFIRM = 1,      // Agente decide, humano confirma
  AUTONOMOUS = 2,   // Agente decide dentro do threshold
}

interface DelegationResult {
  delegationLevel: AutonomyLevel;
  isAutonomous: boolean;
  requiresHumanReview: boolean;
  decision: string;
  confidence: number;
  reason: string;
}

@Injectable()
export class DecisionDelegationEngine {
  private readonly logger = new Logger(DecisionDelegationEngine.name);

  constructor(
    private readonly configRepo: DelegationConfigRepository,
    private readonly decisionRepo: DelegationDecisionRepository,
    private readonly confidenceScorer: ConfidenceScorer,
    private readonly humanGate: HumanInTheLoopGate,
    private readonly auditService: AuditService,
  ) {}

  async delegate(
    tenantId: string,
    agentType: string,
    decisionType: string,
    context: {
      executionId: string;
      agentDecision: string;
      confidence: number;
      chainOfThought: string;
      value?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<DelegationResult> {
    // 1. Carregar configuração de delegação para este tenant/agent/decision
    const config = await this.configRepo.getConfig(tenantId, agentType, decisionType);

    if (!config || !config.enabled) {
      // Sem delegação configurada — sempre humano decide (nível 0)
      return this.handleLevel0(tenantId, agentType, decisionType, context);
    }

    // 2. Ajustar confiança com base no histórico
    const adjustedConfidence = await this.confidenceScorer.adjustConfidence(
      tenantId, agentType, decisionType, context.confidence,
    );

    // 3. Verificar se o valor excede o máximo para decisão autônoma
    if (config.maxAutonomousValue && context.value && context.value > Number(config.maxAutonomousValue)) {
      this.logger.log(
        `Valor ${context.value} excede máximo autônomo ${config.maxAutonomousValue} — escalando para humano`,
      );
      return this.handleLevel0(tenantId, agentType, decisionType, {
        ...context,
        confidence: adjustedConfidence,
      });
    }

    // 4. Aplicar lógica do nível de autonomia
    switch (config.currentLevel) {
      case AutonomyLevel.SUGGEST:
        return this.handleLevel0(tenantId, agentType, decisionType, {
          ...context,
          confidence: adjustedConfidence,
        });

      case AutonomyLevel.CONFIRM:
        return this.handleLevel1(tenantId, agentType, decisionType, config, {
          ...context,
          confidence: adjustedConfidence,
        });

      case AutonomyLevel.AUTONOMOUS:
        return this.handleLevel2(tenantId, agentType, decisionType, config, {
          ...context,
          confidence: adjustedConfidence,
        });

      default:
        return this.handleLevel0(tenantId, agentType, decisionType, context);
    }
  }

  /**
   * Nível 0: Agente sugere, humano decide.
   * O agente apresenta sua análise e recomendação, mas a decisão final é do humano.
   */
  private async handleLevel0(
    tenantId: string,
    agentType: string,
    decisionType: string,
    context: { executionId: string; agentDecision: string; confidence: number; chainOfThought: string },
  ): Promise<DelegationResult> {
    const record = await this.decisionRepo.create({
      tenantId,
      agentType,
      decisionType,
      executionId: context.executionId,
      delegationLevel: AutonomyLevel.SUGGEST,
      confidence: context.confidence,
      agentDecision: context.agentDecision,
      wasAutonomous: false,
      chainOfThought: context.chainOfThought,
    });

    // Enviar para fila de revisão humana
    await this.humanGate.requestApproval(record.id, tenantId);

    return {
      delegationLevel: AutonomyLevel.SUGGEST,
      isAutonomous: false,
      requiresHumanReview: true,
      decision: context.agentDecision,
      confidence: context.confidence,
      reason: 'Nível 0: decisão enviada para revisão humana',
    };
  }

  /**
   * Nível 1: Agente decide, humano confirma.
   * A decisão do agente é aplicada provisoriamente, mas um humano revisa dentro de um prazo.
   * Se o humano não agir, a decisão do agente prevalece.
   */
  private async handleLevel1(
    tenantId: string,
    agentType: string,
    decisionType: string,
    config: DelegationConfig,
    context: { executionId: string; agentDecision: string; confidence: number; chainOfThought: string },
  ): Promise<DelegationResult> {
    const record = await this.decisionRepo.create({
      tenantId,
      agentType,
      decisionType,
      executionId: context.executionId,
      delegationLevel: AutonomyLevel.CONFIRM,
      confidence: context.confidence,
      agentDecision: context.agentDecision,
      wasAutonomous: false,
      chainOfThought: context.chainOfThought,
    });

    // Aplicar decisão provisoriamente
    // Enviar para confirmação humana (não bloqueia execução)
    await this.humanGate.requestConfirmation(record.id, tenantId, {
      timeout: '4h', // humano tem 4h para revisar
      autoApprove: true, // se não agir, decisão do agente prevalece
    });

    return {
      delegationLevel: AutonomyLevel.CONFIRM,
      isAutonomous: false,
      requiresHumanReview: true,
      decision: context.agentDecision,
      confidence: context.confidence,
      reason: 'Nível 1: decisão aplicada provisoriamente, aguardando confirmação humana',
    };
  }

  /**
   * Nível 2: Agente decide autonomamente se confiança >= threshold.
   * Se confiança abaixo do threshold, cai para nível 1.
   */
  private async handleLevel2(
    tenantId: string,
    agentType: string,
    decisionType: string,
    config: DelegationConfig,
    context: { executionId: string; agentDecision: string; confidence: number; chainOfThought: string },
  ): Promise<DelegationResult> {
    const isConfident = context.confidence >= Number(config.confidenceThreshold);

    if (!isConfident) {
      // Confiança insuficiente — fallback para nível 1
      this.logger.log(
        `Confiança ${context.confidence} < threshold ${config.confidenceThreshold} — fallback para nível 1`,
      );
      return this.handleLevel1(tenantId, agentType, decisionType, config, context);
    }

    // Decisão autônoma
    const record = await this.decisionRepo.create({
      tenantId,
      agentType,
      decisionType,
      executionId: context.executionId,
      delegationLevel: AutonomyLevel.AUTONOMOUS,
      confidence: context.confidence,
      agentDecision: context.agentDecision,
      wasAutonomous: true,
      chainOfThought: context.chainOfThought,
    });

    // Registrar no audit trail (ADR-013)
    await this.auditService.record({
      tenantId,
      action: 'AUTONOMOUS_DECISION',
      entityType: 'delegation_decision',
      entityId: record.id,
      metadata: {
        agentType,
        decisionType,
        decision: context.agentDecision,
        confidence: context.confidence,
        delegationLevel: AutonomyLevel.AUTONOMOUS,
      },
    });

    return {
      delegationLevel: AutonomyLevel.AUTONOMOUS,
      isAutonomous: true,
      requiresHumanReview: false,
      decision: context.agentDecision,
      confidence: context.confidence,
      reason: `Nível 2: decisão autônoma (confiança=${context.confidence} >= threshold=${config.confidenceThreshold})`,
    };
  }
}
```

### 3. Gerenciador de Níveis de Autonomia

```typescript
// packages/ai-gateway/src/delegation/autonomy-level-manager.ts
import { Injectable, Logger } from '@nestjs/common';

interface AccuracyReport {
  totalDecisions: number;
  correctDecisions: number;
  accuracy: number;
  autonomousAccuracy: number;
  humanOverrides: number;
  currentLevel: number;
  recommendation: 'PROMOTE' | 'MAINTAIN' | 'REGRESS';
}

@Injectable()
export class AutonomyLevelManager {
  private readonly logger = new Logger(AutonomyLevelManager.name);

  constructor(
    private readonly configRepo: DelegationConfigRepository,
    private readonly decisionRepo: DelegationDecisionRepository,
    private readonly accuracyRepo: DelegationAccuracyRepository,
    private readonly notifier: NotificationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Avaliação periódica de todos os configs de delegação.
   * Executada via cron diário.
   */
  async evaluateAll(): Promise<void> {
    const configs = await this.configRepo.findAllEnabled();

    for (const config of configs) {
      const report = await this.evaluate(config);
      await this.applyRecommendation(config, report);
    }
  }

  async evaluate(config: DelegationConfig): Promise<AccuracyReport> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - config.evaluationWindowDays);

    // Buscar decisões na janela de avaliação
    const decisions = await this.decisionRepo.findInWindow(
      config.tenantId,
      config.agentType,
      config.decisionType,
      windowStart,
    );

    // Filtrar apenas decisões com feedback de corretude
    const evaluated = decisions.filter((d) => d.isCorrect !== null);

    if (evaluated.length < config.minDecisionsForPromotion) {
      return {
        totalDecisions: evaluated.length,
        correctDecisions: evaluated.filter((d) => d.isCorrect).length,
        accuracy: evaluated.length > 0
          ? evaluated.filter((d) => d.isCorrect).length / evaluated.length
          : 0,
        autonomousAccuracy: 0,
        humanOverrides: evaluated.filter((d) => d.humanOverride).length,
        currentLevel: config.currentLevel,
        recommendation: 'MAINTAIN',
      };
    }

    const correct = evaluated.filter((d) => d.isCorrect).length;
    const accuracy = correct / evaluated.length;

    const autonomous = evaluated.filter((d) => d.wasAutonomous);
    const autonomousCorrect = autonomous.filter((d) => d.isCorrect).length;
    const autonomousAccuracy = autonomous.length > 0
      ? autonomousCorrect / autonomous.length
      : 0;

    const humanOverrides = evaluated.filter((d) => d.humanOverride).length;

    let recommendation: AccuracyReport['recommendation'];

    if (accuracy < Number(config.accuracyThresholdRegress)) {
      recommendation = 'REGRESS';
    } else if (accuracy >= Number(config.accuracyThresholdPromote) && config.currentLevel < 2) {
      recommendation = 'PROMOTE';
    } else {
      recommendation = 'MAINTAIN';
    }

    return {
      totalDecisions: evaluated.length,
      correctDecisions: correct,
      accuracy,
      autonomousAccuracy,
      humanOverrides,
      currentLevel: config.currentLevel,
      recommendation,
    };
  }

  private async applyRecommendation(
    config: DelegationConfig,
    report: AccuracyReport,
  ): Promise<void> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - config.evaluationWindowDays);

    // Registrar métricas de acurácia
    await this.accuracyRepo.create({
      tenantId: config.tenantId,
      agentType: config.agentType,
      decisionType: config.decisionType,
      periodStart,
      periodEnd: new Date(),
      totalDecisions: report.totalDecisions,
      correctDecisions: report.correctDecisions,
      autonomousDecisions: report.totalDecisions - report.humanOverrides,
      humanOverrides: report.humanOverrides,
      accuracy: report.accuracy,
      autonomousAccuracy: report.autonomousAccuracy,
      levelAtPeriod: config.currentLevel,
      levelChanged: report.recommendation !== 'MAINTAIN',
      levelChangeDirection: report.recommendation === 'PROMOTE'
        ? 'PROMOTED'
        : report.recommendation === 'REGRESS'
        ? 'REGRESSED'
        : null,
    });

    if (report.recommendation === 'PROMOTE') {
      const newLevel = Math.min(config.currentLevel + 1, 2);
      await this.configRepo.updateLevel(config.id, newLevel);

      this.logger.log(
        `PROMOÇÃO: ${config.agentType}/${config.decisionType} no tenant ${config.tenantId}: ` +
        `nível ${config.currentLevel} → ${newLevel} (acurácia=${(report.accuracy * 100).toFixed(1)}%)`,
      );

      await this.auditService.record({
        tenantId: config.tenantId,
        action: 'DELEGATION_LEVEL_PROMOTED',
        entityType: 'delegation_config',
        entityId: config.id,
        metadata: { from: config.currentLevel, to: newLevel, accuracy: report.accuracy },
      });

      await this.notifier.send({
        channel: 'ai-ops',
        tenantId: config.tenantId,
        severity: 'INFO',
        title: `Autonomia promovida: ${config.agentType} → ${config.decisionType}`,
        body: `Nível ${config.currentLevel} → ${newLevel}. Acurácia: ${(report.accuracy * 100).toFixed(1)}% em ${report.totalDecisions} decisões.`,
      });
    }

    if (report.recommendation === 'REGRESS') {
      const newLevel = Math.max(config.currentLevel - 1, 0);
      await this.configRepo.updateLevel(config.id, newLevel);

      this.logger.warn(
        `REGRESSÃO: ${config.agentType}/${config.decisionType} no tenant ${config.tenantId}: ` +
        `nível ${config.currentLevel} → ${newLevel} (acurácia=${(report.accuracy * 100).toFixed(1)}%)`,
      );

      await this.auditService.record({
        tenantId: config.tenantId,
        action: 'DELEGATION_LEVEL_REGRESSED',
        entityType: 'delegation_config',
        entityId: config.id,
        metadata: { from: config.currentLevel, to: newLevel, accuracy: report.accuracy },
      });

      await this.notifier.send({
        channel: 'ai-ops',
        tenantId: config.tenantId,
        severity: 'HIGH',
        title: `Autonomia reduzida: ${config.agentType} → ${config.decisionType}`,
        body: `Nível ${config.currentLevel} → ${newLevel}. Acurácia caiu para ${(report.accuracy * 100).toFixed(1)}% (mínimo: ${(Number(config.accuracyThresholdRegress) * 100).toFixed(1)}%).`,
      });
    }
  }
}
```

### 4. Calculadora de Confiança Ajustada

```typescript
// packages/ai-gateway/src/delegation/confidence-scorer.ts
import { Injectable } from '@nestjs/common';

interface ConfidenceFactors {
  rawConfidence: number;
  historicalAccuracy: number;
  recentTrend: number;       // positivo = melhorando, negativo = piorando
  decisionComplexity: number; // 0-1, baseado em value e tipo
  adjustedConfidence: number;
}

@Injectable()
export class ConfidenceScorer {
  constructor(
    private readonly decisionRepo: DelegationDecisionRepository,
    private readonly accuracyRepo: DelegationAccuracyRepository,
  ) {}

  /**
   * Ajusta a confiança raw do agente com base no histórico.
   *
   * Um agente que historicamente erra quando diz ter 95% de confiança
   * terá seu score ajustado para baixo. Conversamente, um agente
   * conservador que acerta mais do que sua confiança indica
   * terá o score ajustado para cima.
   */
  async adjustConfidence(
    tenantId: string,
    agentType: string,
    decisionType: string,
    rawConfidence: number,
  ): Promise<number> {
    const factors = await this.calculateFactors(
      tenantId, agentType, decisionType, rawConfidence,
    );

    return factors.adjustedConfidence;
  }

  async calculateFactors(
    tenantId: string,
    agentType: string,
    decisionType: string,
    rawConfidence: number,
  ): Promise<ConfidenceFactors> {
    // 1. Buscar acurácia histórica
    const historicalAccuracy = await this.getHistoricalAccuracy(
      tenantId, agentType, decisionType,
    );

    // 2. Calcular tendência recente (últimas 2 semanas vs período anterior)
    const recentTrend = await this.getRecentTrend(
      tenantId, agentType, decisionType,
    );

    // 3. Calcular fator de calibração
    // Se o agente diz 90% mas acerta só 80%, fator = 0.80 / 0.90 = 0.889
    const calibrationFactor = historicalAccuracy > 0
      ? Math.min(historicalAccuracy / Math.max(rawConfidence, 0.01), 1.2)
      : 1.0; // sem histórico, não ajustar

    // 4. Aplicar tendência recente (bônus/penalidade de até 5%)
    const trendAdjustment = Math.max(-0.05, Math.min(0.05, recentTrend * 0.1));

    // 5. Calcular confiança ajustada
    const adjustedConfidence = Math.max(0, Math.min(1,
      rawConfidence * calibrationFactor + trendAdjustment,
    ));

    return {
      rawConfidence,
      historicalAccuracy,
      recentTrend,
      decisionComplexity: 0, // TODO: calcular baseado no tipo e valor
      adjustedConfidence,
    };
  }

  private async getHistoricalAccuracy(
    tenantId: string,
    agentType: string,
    decisionType: string,
  ): Promise<number> {
    const records = await this.accuracyRepo.findRecent(
      tenantId, agentType, decisionType, 3, // últimos 3 períodos
    );

    if (records.length === 0) return 0;

    // Média ponderada: períodos mais recentes pesam mais
    const weights = [0.5, 0.3, 0.2];
    let totalWeight = 0;
    let weightedAccuracy = 0;

    for (let i = 0; i < records.length; i++) {
      const weight = weights[i] ?? 0.1;
      weightedAccuracy += Number(records[i].accuracy) * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedAccuracy / totalWeight : 0;
  }

  private async getRecentTrend(
    tenantId: string,
    agentType: string,
    decisionType: string,
  ): Promise<number> {
    const recentDecisions = await this.decisionRepo.findRecent(
      tenantId, agentType, decisionType, 14, // últimos 14 dias
    );

    if (recentDecisions.length < 10) return 0; // amostra insuficiente

    const midpoint = Math.floor(recentDecisions.length / 2);
    const firstHalf = recentDecisions.slice(0, midpoint);
    const secondHalf = recentDecisions.slice(midpoint);

    const firstAccuracy = firstHalf.filter((d) => d.isCorrect).length / firstHalf.length;
    const secondAccuracy = secondHalf.filter((d) => d.isCorrect).length / secondHalf.length;

    return secondAccuracy - firstAccuracy; // positivo = melhorando
  }
}
```

### 5. Fluxo de Decisão Delegada

```
[Agente toma decisão] → DecisionDelegationEngine.delegate()
                          ├── Carregar config (tenant + agent_type + decision_type)
                          ├── ConfidenceScorer.adjustConfidence()
                          ├── Verificar valor máximo autônomo
                          └── Aplicar nível:
                              ├── Nível 0: → HumanGate (bloqueia)
                              ├── Nível 1: → Aplica + HumanGate (confirma em 4h)
                              └── Nível 2: → Aplica autonomamente (se confiança >= threshold)
                                            → Fallback nível 1 (se confiança < threshold)

[Cron Diário] → AutonomyLevelManager.evaluateAll()
                  ├── Para cada config:
                  │   ├── Calcular acurácia na janela
                  │   ├── Acurácia >= threshold_promote? → PROMOTE
                  │   ├── Acurácia < threshold_regress?  → REGRESS
                  │   └── Caso contrário → MAINTAIN
                  └── Registrar em delegation_accuracy + audit trail
```

## Consequências

### Positivas
- Redução progressiva de carga operacional: agentes precisos ganham autonomia, liberando humanos para decisões complexas.
- Segurança por design: autonomia é conquistada, não configurada — o sistema regride automaticamente se a acurácia cair.
- Per-tenant: cada tenant pode ter thresholds diferentes de acordo com sua tolerância a risco.
- Rastreabilidade completa: cada decisão, autônoma ou não, é registrada com chain-of-thought e nível de delegação.
- Calibração de confiança: o sistema aprende a ajustar a auto-avaliação do agente com base em dados reais.
- Escalabilidade: à medida que agentes melhoram, o sistema escala sem necessidade de mais revisores humanos.

### Negativas
- Complexidade do modelo: três níveis de autonomia com transições automáticas adicionam complexidade significativa.
- Dependência de feedback: sem feedback de corretude (is_correct), o sistema não pode calcular acurácia e não promove.
- Latência de promoção: o agente precisa de min_decisions_for_promotion decisões corretas antes de ser promovido — pode levar semanas.
- Risco de falso positivo: em cenários com distribuição enviesada, acurácia alta pode mascarar falhas em edge cases.
- Resistência organizacional: stakeholders podem desconfiar de decisões autônomas de IA (mitigado com audit trail e métricas de acurácia).

## Implementação

- **DecisionDelegationEngine** integrado ao AgentRuntime (ADR-028) como middleware de decisão.
- **API REST** para tenant_admins configurarem thresholds e habilitarem/desabilitarem delegação por tipo de decisão.
- **Dashboard** com visualização de: nível atual por decisão, histórico de acurácia, decisões pendentes, timeline de promoções/regressões.
- **Feedback loop**: integração com outcomes de negócio para preencher `is_correct` automaticamente quando possível.
- **Sampling de auditoria**: mesmo em nível 2, 10% das decisões autônomas são revisadas por humanos para validar acurácia contínua.
- **Cron diário** via BullMQ executa `AutonomyLevelManager.evaluateAll()`.

## Validação

- Teste de nível 0: todas as decisões são enviadas para revisão humana e execução não avança sem aprovação.
- Teste de nível 1: decisão é aplicada provisoriamente e humano pode reverter dentro de 4h.
- Teste de nível 2: decisão com confiança >= threshold é aplicada autonomamente sem bloqueio.
- Teste de fallback: decisão nível 2 com confiança < threshold cai para nível 1.
- Teste de promoção: após 100 decisões corretas com acurácia >= 95%, nível é promovido automaticamente.
- Teste de regressão: acurácia caindo abaixo de 85% regride o nível automaticamente.
- Teste de valor máximo: decisão autônoma com valor > maxAutonomousValue é escalada para humano.
- Teste de calibração: agente que diz 95% mas acerta 80% tem confiança ajustada para ~80%.
- Teste de audit trail: todas as decisões delegadas aparecem no audit trail com nível e chain-of-thought.
- Teste multi-tenant: promoção no tenant A não afeta nível do tenant B.

## Referências

- ADR 028 — Runtime de Agentes com Gestão de Estado
- ADR 026 — Observabilidade de IA: Métricas de Alucinação e Qualidade
- ADR 013 — Trust Infrastructure
- ADR 021 — Governança de Shadow AI
- ADR 014 — Pricing Baseado em Outcomes
- REQ-AI-005 — Requisitos de Autonomia Gradual de Agentes
