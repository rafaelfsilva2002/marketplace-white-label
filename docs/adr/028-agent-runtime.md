# ADR 028: Runtime de Agentes com Gestão de Estado

## Status

**Aceito** — Março 2026

## Contexto

A plataforma evolui de chamadas isoladas a LLMs (pergunta → resposta) para workflows autônomos onde agentes de IA executam tarefas complexas em múltiplas etapas: ingestão automática de catálogos, resolução de disputas, otimização de pricing, moderação de conteúdo com escalação inteligente, e análise de fraude. Esses agentes precisam manter estado entre etapas, tomar decisões intermediárias e, criticamente, solicitar intervenção humana para ações destrutivas ou financeiras.

O problema fundamental é que agentes stateless (que recebem todo o contexto em cada chamada) são caros, lentos e propensos a inconsistências. Um agente de ingestão que processa 10.000 itens de catálogo não pode reenviar o contexto completo a cada item. O estado precisa ser persistido de forma durável, permitindo recuperação após falhas e inspeção por operadores.

Além disso, agentes sem limites são perigosos: um loop infinito pode consumir milhares de dólares em tokens, um agente que toma decisões erradas sem supervisão pode causar dano real (reembolsos indevidos, bloqueio de contas legítimas). Cada tenant tem tolerância diferente a risco e autonomia de agentes, e o sistema precisa respeitar essas configurações.

A integração com Temporal (ADR-018) é natural: agentes de longa duração são essencialmente workflows com etapas que podem envolver chamadas a LLMs, espera por aprovação humana e consultas a sistemas externos.

## Decisão

Implementamos um **runtime dedicado para agentes autônomos** com estado persistido, limites configuráveis, human-in-the-loop obrigatório e circuit breaker:

### 1. Modelo de Dados para Execuções de Agentes

```sql
CREATE TABLE agent_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    agent_type      VARCHAR(100) NOT NULL,       -- CATALOG_INGESTION, DISPUTE_RESOLUTION, FRAUD_ANALYSIS
    status          VARCHAR(20) DEFAULT 'RUNNING',-- RUNNING, PAUSED, WAITING_HUMAN, COMPLETED, FAILED, ABORTED
    input           JSONB NOT NULL,               -- payload inicial do agente
    state           JSONB NOT NULL DEFAULT '{}',  -- estado persistido entre etapas
    output          JSONB,                        -- resultado final
    total_steps     INTEGER DEFAULT 0,
    max_steps       INTEGER NOT NULL,             -- limite configurável por agent_type + tenant
    total_tokens    INTEGER DEFAULT 0,
    max_tokens      INTEGER NOT NULL,             -- limite de tokens total
    total_cost      NUMERIC(10, 6) DEFAULT 0,
    max_cost        NUMERIC(10, 6) NOT NULL,      -- limite de custo total
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    timeout_at      TIMESTAMPTZ NOT NULL,          -- deadline absoluto
    triggered_by    UUID NOT NULL,                 -- user ou system que iniciou
    correlation_id  UUID,                          -- referência ao workflow Temporal
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id    UUID NOT NULL REFERENCES agent_executions(id),
    step_number     INTEGER NOT NULL,
    action          VARCHAR(100) NOT NULL,         -- THINK, TOOL_CALL, HUMAN_REQUEST, DECIDE
    input           JSONB NOT NULL,                -- input deste step
    output          JSONB,                         -- output deste step
    state_before    JSONB NOT NULL,                -- snapshot do estado antes do step
    state_after     JSONB,                         -- snapshot do estado depois do step
    model_used      VARCHAR(100),                  -- modelo de IA usado neste step (se aplicável)
    tokens_used     INTEGER DEFAULT 0,
    cost            NUMERIC(10, 6) DEFAULT 0,
    latency_ms      INTEGER,
    error           TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE agent_decisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id    UUID NOT NULL REFERENCES agent_executions(id),
    step_id         UUID NOT NULL REFERENCES agent_steps(id),
    decision_type   VARCHAR(100) NOT NULL,         -- REFUND, BLOCK_ACCOUNT, APPROVE_LISTING, etc.
    description     TEXT NOT NULL,                  -- descrição legível da decisão
    chain_of_thought TEXT NOT NULL,                 -- raciocínio completo do agente
    confidence      NUMERIC(5, 4) NOT NULL,        -- 0.0000 a 1.0000
    requires_human  BOOLEAN DEFAULT false,
    human_approved  BOOLEAN,
    human_reviewer  UUID,
    human_notes     TEXT,
    outcome         VARCHAR(20),                   -- APPROVED, REJECTED, MODIFIED
    decided_at      TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX idx_agent_executions_tenant ON agent_executions(tenant_id, status);
CREATE INDEX idx_agent_executions_type ON agent_executions(agent_type, status);
CREATE INDEX idx_agent_steps_execution ON agent_steps(execution_id, step_number);
CREATE INDEX idx_agent_decisions_pending ON agent_decisions(requires_human, outcome)
    WHERE requires_human = true AND outcome IS NULL;
```

### 2. Runtime de Agentes

```typescript
// packages/ai-gateway/src/agents/agent-runtime.ts
import { Injectable, Logger } from '@nestjs/common';

interface AgentConfig {
  agentType: string;
  maxSteps: number;
  maxTokens: number;
  maxCost: number;
  timeoutMs: number;
  humanRequiredActions: string[];  // ações que exigem aprovação humana
}

interface StepResult {
  action: string;
  output: unknown;
  tokensUsed: number;
  cost: number;
  nextState: Record<string, unknown>;
  decision?: {
    type: string;
    description: string;
    chainOfThought: string;
    confidence: number;
  };
  done: boolean;
}

@Injectable()
export class AgentRuntime {
  private readonly logger = new Logger(AgentRuntime.name);

  constructor(
    private readonly executionRepo: AgentExecutionRepository,
    private readonly stepRepo: AgentStepRepository,
    private readonly decisionRepo: AgentDecisionRepository,
    private readonly circuitBreaker: AgentCircuitBreaker,
    private readonly humanGate: HumanInTheLoopGate,
    private readonly aiGateway: AiGatewayService,
    private readonly configService: AgentConfigService,
  ) {}

  async execute(
    tenantId: string,
    agentType: string,
    input: Record<string, unknown>,
    triggeredBy: string,
  ): Promise<string> {
    // 1. Carregar configuração do agente para este tenant
    const config = await this.configService.getConfig(tenantId, agentType);

    // 2. Verificar circuit breaker antes de iniciar
    await this.circuitBreaker.assertHealthy(tenantId, agentType);

    // 3. Criar execução
    const execution = await this.executionRepo.create({
      tenantId,
      agentType,
      input,
      maxSteps: config.maxSteps,
      maxTokens: config.maxTokens,
      maxCost: config.maxCost,
      timeoutAt: new Date(Date.now() + config.timeoutMs),
      triggeredBy,
    });

    // 4. Executar loop do agente (via Temporal para durabilidade)
    await this.startAgentWorkflow(execution.id, config);

    return execution.id;
  }

  async runStep(
    executionId: string,
    config: AgentConfig,
  ): Promise<StepResult> {
    const execution = await this.executionRepo.findById(executionId);

    // Verificações de limite
    this.assertWithinLimits(execution, config);

    const stateBefore = { ...execution.state };
    const stepNumber = execution.totalSteps + 1;

    // Construir prompt do agente com estado atual
    const prompt = this.buildAgentPrompt(execution, config);

    // Chamar LLM via AI Gateway (com métricas ADR-026)
    const llmResponse = await this.aiGateway.complete({
      tenantId: execution.tenantId,
      feature: `agent:${config.agentType}`,
      prompt,
      systemPrompt: this.getSystemPrompt(config.agentType),
    });

    // Parsear resposta estruturada do agente
    const stepResult = this.parseAgentResponse(llmResponse);

    // Persistir step
    const step = await this.stepRepo.create({
      executionId,
      stepNumber,
      action: stepResult.action,
      input: { prompt: prompt.substring(0, 1000) }, // truncar para storage
      output: stepResult.output,
      stateBefore,
      stateAfter: stepResult.nextState,
      modelUsed: llmResponse.model,
      tokensUsed: llmResponse.usage.totalTokens,
      cost: llmResponse.cost,
      latencyMs: llmResponse.latencyMs,
    });

    // Se o agente tomou uma decisão, registrar
    if (stepResult.decision) {
      await this.handleDecision(execution, step.id, stepResult.decision, config);
    }

    // Atualizar estado da execução
    await this.executionRepo.update(executionId, {
      state: stepResult.nextState,
      totalSteps: stepNumber,
      totalTokens: execution.totalTokens + llmResponse.usage.totalTokens,
      totalCost: Number(execution.totalCost) + llmResponse.cost,
      status: stepResult.done ? 'COMPLETED' : execution.status,
      completedAt: stepResult.done ? new Date() : undefined,
    });

    // Atualizar circuit breaker
    await this.circuitBreaker.recordStep(execution.tenantId, config.agentType, {
      success: !step.error,
      cost: llmResponse.cost,
      latencyMs: llmResponse.latencyMs,
    });

    return stepResult;
  }

  private assertWithinLimits(
    execution: AgentExecution,
    config: AgentConfig,
  ): void {
    if (execution.totalSteps >= config.maxSteps) {
      throw new AgentLimitExceededError(
        `Limite de steps atingido: ${execution.totalSteps}/${config.maxSteps}`,
      );
    }
    if (execution.totalTokens >= config.maxTokens) {
      throw new AgentLimitExceededError(
        `Limite de tokens atingido: ${execution.totalTokens}/${config.maxTokens}`,
      );
    }
    if (Number(execution.totalCost) >= config.maxCost) {
      throw new AgentLimitExceededError(
        `Limite de custo atingido: $${execution.totalCost}/$${config.maxCost}`,
      );
    }
    if (new Date() > new Date(execution.timeoutAt)) {
      throw new AgentLimitExceededError(
        `Timeout atingido: execução iniciada em ${execution.startedAt}`,
      );
    }
  }

  private async handleDecision(
    execution: AgentExecution,
    stepId: string,
    decision: StepResult['decision'],
    config: AgentConfig,
  ): Promise<void> {
    const requiresHuman = config.humanRequiredActions.includes(decision!.type)
      || decision!.confidence < 0.80; // confiança baixa → humano decide

    const record = await this.decisionRepo.create({
      executionId: execution.id,
      stepId,
      decisionType: decision!.type,
      description: decision!.description,
      chainOfThought: decision!.chainOfThought,
      confidence: decision!.confidence,
      requiresHuman,
    });

    if (requiresHuman) {
      // Pausar execução e aguardar aprovação
      await this.executionRepo.update(execution.id, { status: 'WAITING_HUMAN' });
      await this.humanGate.requestApproval(record.id, execution.tenantId);
    }
  }

  private buildAgentPrompt(
    execution: AgentExecution,
    config: AgentConfig,
  ): string {
    return [
      `## Estado Atual`,
      `Step: ${execution.totalSteps + 1}/${config.maxSteps}`,
      `Tokens usados: ${execution.totalTokens}/${config.maxTokens}`,
      `Estado: ${JSON.stringify(execution.state)}`,
      ``,
      `## Input Original`,
      JSON.stringify(execution.input),
      ``,
      `## Instruções`,
      `Analise o estado atual e decida o próximo passo.`,
      `Responda em JSON com: { action, output, nextState, decision?, done }`,
    ].join('\n');
  }

  private getSystemPrompt(agentType: string): string {
    // System prompts versionados por tipo de agente (packages/prompts/)
    return `Você é um agente autônomo do tipo ${agentType}. Siga as instruções e responda em JSON estruturado.`;
  }

  private parseAgentResponse(response: AiResponse): StepResult {
    try {
      return JSON.parse(response.content) as StepResult;
    } catch {
      return {
        action: 'PARSE_ERROR',
        output: { raw: response.content },
        tokensUsed: 0,
        cost: 0,
        nextState: {},
        done: true,
      };
    }
  }
}
```

### 3. Gate de Human-in-the-Loop

```typescript
// packages/ai-gateway/src/agents/human-in-the-loop-gate.ts
import { Injectable, Logger } from '@nestjs/common';

interface ApprovalRequest {
  decisionId: string;
  tenantId: string;
  executionId: string;
  agentType: string;
  decisionType: string;
  description: string;
  chainOfThought: string;
  confidence: number;
  requestedAt: Date;
}

@Injectable()
export class HumanInTheLoopGate {
  private readonly logger = new Logger(HumanInTheLoopGate.name);

  constructor(
    private readonly decisionRepo: AgentDecisionRepository,
    private readonly executionRepo: AgentExecutionRepository,
    private readonly notifier: NotificationService,
    private readonly temporalClient: TemporalClient,
  ) {}

  async requestApproval(
    decisionId: string,
    tenantId: string,
  ): Promise<void> {
    const decision = await this.decisionRepo.findById(decisionId);
    const execution = await this.executionRepo.findById(decision.executionId);

    this.logger.log(
      `Human approval required: ${decision.decisionType} (confidence=${decision.confidence})`,
    );

    // Notificar via múltiplos canais
    await this.notifier.send({
      channel: 'agent-approvals',
      tenantId,
      severity: 'MEDIUM',
      title: `Agente ${execution.agentType} solicita aprovação`,
      body: [
        `**Decisão**: ${decision.decisionType}`,
        `**Descrição**: ${decision.description}`,
        `**Confiança**: ${(decision.confidence * 100).toFixed(1)}%`,
        `**Raciocínio**: ${decision.chainOfThought.substring(0, 500)}...`,
      ].join('\n'),
      actions: [
        { label: 'Aprovar', action: `approve:${decisionId}` },
        { label: 'Rejeitar', action: `reject:${decisionId}` },
        { label: 'Modificar', action: `modify:${decisionId}` },
      ],
    });

    // Sinalizar workflow Temporal para aguardar
    if (execution.correlationId) {
      await this.temporalClient.signal(
        execution.correlationId,
        'awaitHumanApproval',
        { decisionId },
      );
    }
  }

  async processApproval(
    decisionId: string,
    reviewerId: string,
    outcome: 'APPROVED' | 'REJECTED' | 'MODIFIED',
    notes?: string,
  ): Promise<void> {
    const decision = await this.decisionRepo.findById(decisionId);

    // Registrar decisão humana
    await this.decisionRepo.update(decisionId, {
      humanApproved: outcome === 'APPROVED',
      humanReviewer: reviewerId,
      humanNotes: notes,
      outcome,
      reviewedAt: new Date(),
    });

    const execution = await this.executionRepo.findById(decision.executionId);

    if (outcome === 'APPROVED') {
      // Retomar execução do agente
      await this.executionRepo.update(execution.id, { status: 'RUNNING' });

      if (execution.correlationId) {
        await this.temporalClient.signal(
          execution.correlationId,
          'humanApprovalReceived',
          { decisionId, outcome: 'APPROVED' },
        );
      }
    } else if (outcome === 'REJECTED') {
      // Abortar execução
      await this.executionRepo.update(execution.id, {
        status: 'ABORTED',
        completedAt: new Date(),
        output: { reason: 'HUMAN_REJECTED', notes },
      });
    } else if (outcome === 'MODIFIED') {
      // Retomar com instruções modificadas
      await this.executionRepo.update(execution.id, {
        status: 'RUNNING',
        state: {
          ...execution.state,
          humanModification: notes,
        },
      });

      if (execution.correlationId) {
        await this.temporalClient.signal(
          execution.correlationId,
          'humanApprovalReceived',
          { decisionId, outcome: 'MODIFIED', modification: notes },
        );
      }
    }

    this.logger.log(
      `Decision ${decisionId} ${outcome} by ${reviewerId}`,
    );
  }
}
```

### 4. Circuit Breaker para Agentes

```typescript
// packages/ai-gateway/src/agents/agent-circuit-breaker.ts
import { Injectable, Logger } from '@nestjs/common';

interface CircuitState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  totalCost: number;
  totalSteps: number;
  lastFailureAt?: Date;
  openedAt?: Date;
}

interface StepOutcome {
  success: boolean;
  cost: number;
  latencyMs: number;
}

@Injectable()
export class AgentCircuitBreaker {
  private readonly logger = new Logger(AgentCircuitBreaker.name);

  // Thresholds configuráveis
  private readonly MAX_FAILURES = 5;
  private readonly MAX_COST_PER_HOUR = 50.0;    // USD
  private readonly MAX_STEPS_PER_HOUR = 500;
  private readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

  constructor(
    private readonly cache: CacheService,
    private readonly notifier: NotificationService,
  ) {}

  async assertHealthy(tenantId: string, agentType: string): Promise<void> {
    const state = await this.getState(tenantId, agentType);

    if (state.status === 'OPEN') {
      // Verificar se cooldown expirou
      if (state.openedAt && Date.now() - state.openedAt.getTime() > this.COOLDOWN_MS) {
        await this.transitionTo(tenantId, agentType, 'HALF_OPEN');
        return; // Permitir uma tentativa
      }

      throw new AgentCircuitOpenError(
        `Circuit breaker ABERTO para ${agentType} no tenant ${tenantId}. ` +
        `Motivo: ${state.failureCount} falhas, $${state.totalCost.toFixed(2)} de custo na última hora.`,
      );
    }
  }

  async recordStep(
    tenantId: string,
    agentType: string,
    outcome: StepOutcome,
  ): Promise<void> {
    const key = this.getKey(tenantId, agentType);
    const state = await this.getState(tenantId, agentType);

    state.totalSteps++;
    state.totalCost += outcome.cost;

    if (!outcome.success) {
      state.failureCount++;
      state.lastFailureAt = new Date();
    }

    // Verificar condições de abertura
    if (state.failureCount >= this.MAX_FAILURES) {
      await this.openCircuit(tenantId, agentType, state,
        `Limite de falhas atingido: ${state.failureCount}/${this.MAX_FAILURES}`);
      return;
    }

    if (state.totalCost >= this.MAX_COST_PER_HOUR) {
      await this.openCircuit(tenantId, agentType, state,
        `Limite de custo por hora atingido: $${state.totalCost.toFixed(2)}/$${this.MAX_COST_PER_HOUR}`);
      return;
    }

    if (state.totalSteps >= this.MAX_STEPS_PER_HOUR) {
      await this.openCircuit(tenantId, agentType, state,
        `Limite de steps por hora atingido: ${state.totalSteps}/${this.MAX_STEPS_PER_HOUR}`);
      return;
    }

    // Se estava HALF_OPEN e o step foi sucesso, fechar
    if (state.status === 'HALF_OPEN' && outcome.success) {
      state.status = 'CLOSED';
      state.failureCount = 0;
      this.logger.log(`Circuit breaker FECHADO para ${agentType}/${tenantId}`);
    }

    await this.cache.set(key, JSON.stringify(state), 3600); // TTL 1h
  }

  private async openCircuit(
    tenantId: string,
    agentType: string,
    state: CircuitState,
    reason: string,
  ): Promise<void> {
    state.status = 'OPEN';
    state.openedAt = new Date();

    const key = this.getKey(tenantId, agentType);
    await this.cache.set(key, JSON.stringify(state), 3600);

    this.logger.warn(`Circuit breaker ABERTO: ${agentType}/${tenantId} — ${reason}`);

    await this.notifier.send({
      channel: 'ai-ops',
      severity: 'HIGH',
      title: `Agent Circuit Breaker ABERTO`,
      body: `Agente ${agentType} para tenant ${tenantId}: ${reason}`,
    });
  }

  private async transitionTo(
    tenantId: string,
    agentType: string,
    newStatus: CircuitState['status'],
  ): Promise<void> {
    const state = await this.getState(tenantId, agentType);
    state.status = newStatus;
    const key = this.getKey(tenantId, agentType);
    await this.cache.set(key, JSON.stringify(state), 3600);
    this.logger.log(`Circuit breaker → ${newStatus}: ${agentType}/${tenantId}`);
  }

  private async getState(tenantId: string, agentType: string): Promise<CircuitState> {
    const key = this.getKey(tenantId, agentType);
    const cached = await this.cache.get(key);

    if (cached) return JSON.parse(cached);

    return {
      status: 'CLOSED',
      failureCount: 0,
      totalCost: 0,
      totalSteps: 0,
    };
  }

  private getKey(tenantId: string, agentType: string): string {
    return `agent-circuit:${tenantId}:${agentType}`;
  }
}
```

### 5. Integração com Temporal (ADR-018)

```typescript
// workers/src/workflows/agent-execution.workflow.ts
import { proxyActivities, condition, defineSignal, setHandler } from '@temporalio/workflow';
import type * as activities from './agent-execution.activities';

const { runAgentStep, checkExecution, abortExecution } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '2m',
    retry: { maximumAttempts: 3 },
  });

export const humanApprovalSignal = defineSignal<[{ decisionId: string; outcome: string; modification?: string }]>('humanApprovalReceived');
export const abortSignal = defineSignal('abortAgent');

export async function agentExecutionWorkflow(executionId: string): Promise<void> {
  let humanApproval: { decisionId: string; outcome: string } | null = null;
  let aborted = false;

  setHandler(humanApprovalSignal, (approval) => { humanApproval = approval; });
  setHandler(abortSignal, () => { aborted = true; });

  while (!aborted) {
    const execution = await checkExecution(executionId);

    if (execution.status === 'COMPLETED' || execution.status === 'ABORTED') break;

    if (execution.status === 'WAITING_HUMAN') {
      // Aguardar sinal de aprovação humana (até 24h)
      const approved = await condition(() => humanApproval !== null, '24h');

      if (!approved || humanApproval?.outcome === 'REJECTED') {
        await abortExecution(executionId, 'HUMAN_TIMEOUT_OR_REJECTED');
        break;
      }
      humanApproval = null; // Reset para próxima decisão
      continue;
    }

    // Executar próximo step
    const result = await runAgentStep(executionId);

    if (result.done) break;
  }
}
```

## Consequências

### Positivas
- Estado persistido entre etapas elimina perda de progresso em caso de falha — agentes são recuperáveis.
- Human-in-the-loop obrigatório para ações destrutivas e financeiras — segurança por design.
- Audit trail completo com chain-of-thought permite explicabilidade de decisões (LGPD Art. 20).
- Circuit breaker previne custos descontrolados e loops infinitos.
- Limites configuráveis por tenant e por tipo de agente permitem controle granular.
- Integração com Temporal garante durabilidade e visibilidade operacional.

### Negativas
- Overhead de persistência: cada step gera escrita em `agent_steps` e atualização em `agent_executions`.
- Latência adicional: persistir estado antes/depois de cada step adiciona ~10-20ms.
- Complexidade de debugging: agentes autônomos são inerentemente difíceis de depurar (mitigado com chain-of-thought completo).
- Human-in-the-loop pode se tornar gargalo se volume de decisões for alto (mitigado com Decision Delegation ADR-029).
- Dependência do Temporal para execuções de longa duração adiciona complexidade operacional.

## Implementação

- **AgentRuntime** como módulo NestJS dentro do pacote `ai-gateway`.
- **Workers Temporal** dedicados para execuções de agentes (`agent-worker` pool separado).
- **Dashboard de operações** com visão de todas as execuções ativas, painel de decisões pendentes e histórico.
- **API REST** para iniciar execuções, consultar status, aprovar/rejeitar decisões.
- **WebSocket** para notificações em tempo real de decisões pendentes ao painel de admin do tenant.
- **Particionamento** de `agent_steps` por mês para gerenciar volume.
- **Retenção**: steps mais antigos que 180 dias são arquivados para cold storage.

## Validação

- Teste de persistência: derrubar worker no meio de uma execução e verificar que retoma do último step.
- Teste de limites: agente que excede maxSteps é abortado automaticamente.
- Teste de custo: agente que excede maxCost dispara circuit breaker.
- Teste de human-in-the-loop: ação destrutiva pausa execução e aguarda aprovação.
- Teste de timeout: agente que excede timeoutAt é abortado.
- Teste de circuit breaker: 5 falhas consecutivas abrem o circuito; cooldown de 5 min.
- Teste de audit trail: cada decisão tem chain-of-thought registrado e consultável.
- Teste de Temporal: workflow sobrevive a restart do worker e retoma corretamente.
- Teste de carga: 50 agentes concorrentes por tenant sem degradação de performance.

## Referências

- ADR 018 — Camada de Orquestração (Temporal)
- ADR 024 — AI Gateway: Roteamento Inteligente Multi-Provider
- ADR 026 — Observabilidade de IA: Métricas de Alucinação e Qualidade
- ADR 013 — Trust Infrastructure
- ADR 021 — Governança de Shadow AI
- REQ-AI-004 — Requisitos de Agentes Autônomos
