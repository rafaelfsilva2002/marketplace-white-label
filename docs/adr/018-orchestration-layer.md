# ADR 018: Camada de Orquestração como Ativo Estratégico

## Status

**Aceito** — Março 2026

## Contexto

A plataforma marketplace executa diversos processos de negócio de longa duração: onboarding de novos sellers (que envolve verificação de identidade, compliance AML, configuração de conta Stripe Connect, provisionamento de dados), processamento de pagamentos multi-etapa (autorização, captura, split, reconciliação), e resolução de disputas (abertura, coleta de evidências, arbitragem, reembolso). Esses fluxos atravessam múltiplos serviços e podem levar de minutos a semanas para completar.

Implementar esses fluxos com chamadas síncronas entre serviços ou filas de mensagens ad hoc resulta em lógica distribuída difícil de rastrear, testar e debugar. Quando um passo falha, a recuperação manual é propensa a erros. Não há visibilidade centralizada de onde cada processo se encontra, e auditorias regulatórias exigem prova de que cada etapa foi executada corretamente.

O padrão Saga para transações distribuídas é essencial, mas sem um runtime de orquestração, implementá-lo manualmente em cada fluxo gera duplicação massiva de código de compensação, timeouts e retries.

## Decisão

Adotamos **Temporal** como runtime de orquestração para workflows de longa duração, complementado pelo padrão Saga para transações distribuídas:

### 1. Workflows como Código (Temporal)

```typescript
// workflows/seller-onboarding.workflow.ts
import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from './seller-onboarding.activities';

const { verifyIdentity, checkAmlCompliance, createStripeAccount,
        provisionTenantData, sendWelcomeEmail, compensateStripeAccount,
        compensateIdentityVerification } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  retry: { maximumAttempts: 3, backoffCoefficient: 2 },
});

export async function sellerOnboardingWorkflow(input: OnboardingInput): Promise<OnboardingResult> {
  const compensations: Array<() => Promise<void>> = [];

  try {
    // Etapa 1: Verificação de identidade
    const identity = await verifyIdentity(input.sellerId, input.documents);
    compensations.push(() => compensateIdentityVerification(identity.verificationId));

    // Etapa 2: Compliance AML (ADR 010)
    const amlResult = await checkAmlCompliance(input.sellerId, identity);
    if (amlResult.riskLevel === 'HIGH') {
      return { status: 'REJECTED', reason: 'AML_HIGH_RISK' };
    }

    // Etapa 3: Conta Stripe Connect
    const stripeAccount = await createStripeAccount(input.sellerId, identity);
    compensations.push(() => compensateStripeAccount(stripeAccount.id));

    // Etapa 4: Provisionamento de dados do tenant
    await provisionTenantData(input.tenantId, input.sellerId);

    // Etapa 5: Notificação
    await sendWelcomeEmail(input.sellerId, input.tenantId);

    return { status: 'COMPLETED', stripeAccountId: stripeAccount.id };
  } catch (error) {
    // Saga: executar compensações em ordem reversa
    for (const compensate of compensations.reverse()) {
      try { await compensate(); } catch (compError) {
        // Log e continuar — compensação não pode falhar silenciosamente
      }
    }
    return { status: 'FAILED', reason: error.message };
  }
}
```

### 2. Padrão Saga para Transações Distribuídas

Cada workflow que modifica estado em múltiplos serviços implementa o padrão Saga:

```
Etapa 1: Ação A → registra compensação A'
Etapa 2: Ação B → registra compensação B'
Etapa 3: Ação C → FALHA
→ Executa B' (compensação de B)
→ Executa A' (compensação de A)
→ Workflow marcado como COMPENSATED
```

### 3. Versionamento de Workflows

```typescript
import { patched } from '@temporalio/workflow';

export async function paymentProcessingWorkflow(input: PaymentInput) {
  if (patched('v2-add-fraud-check')) {
    await checkFraudSignals(input);  // adicionado na v2
  }
  await authorizePayment(input);
  await capturePayment(input);
  await splitPayment(input);
}
```

### 4. Workflows Principais

| Workflow | Duração Típica | Etapas | Saga |
|---|---|---|---|
| Seller Onboarding | 1-7 dias | 5 | Sim |
| Payment Processing | 1-30 segundos | 4 | Sim |
| Dispute Resolution | 1-30 dias | 6 | Sim |
| Subscription Renewal | < 1 minuto | 3 | Sim |
| Tenant Provisioning | 5-15 minutos | 8 | Sim |
| Bulk Data Export | 1-60 minutos | 3 | Não |

## Consequências

### Positivas
- Visibilidade completa: o estado de cada processo está no Temporal UI — não há "black box".
- Workflows versionados permitem evolução sem interromper processos em andamento.
- Replay determinístico: falhas podem ser reproduzidas e depuradas com histórico completo.
- Saga pattern implementado de forma consistente em todos os fluxos distribuídos.
- Auditabilidade nativa: cada etapa do workflow é registrada com timestamps.

### Negativas
- Dependência operacional do Temporal como infraestrutura crítica (mitigada com cluster HA).
- Curva de aprendizado significativa para o modelo de programação de workflows Temporal.
- Overhead de serialização para cada etapa do workflow (payload deve ser serializable).
- Custo adicional de infraestrutura para cluster Temporal (PostgreSQL + Temporal server).

## Implementação

- **Temporal Server** em cluster HA com PostgreSQL dedicado para persistence store.
- **Workers NestJS** como módulo dedicado (`@marketplace/temporal-workers`).
- **Namespace por ambiente**: `production`, `staging`, `development`.
- **Temporal UI** acessível para times de operação e suporte com filtros por tenant.
- **Métricas** exportadas para Grafana: workflow duration, failure rate, queue depth.
- **Dead Letter Queue** para workflows que falharam após todas as tentativas de retry.

## Validação

- Testes unitários para lógica de cada workflow usando `@temporalio/testing`.
- Teste de Saga: simular falha em cada etapa e verificar que compensações executam corretamente.
- Teste de versionamento: deploy de nova versão não interrompe workflows em andamento.
- Teste de replay: re-executar workflow a partir do histórico e verificar determinismo.
- Teste de carga: 1000 workflows de pagamento concorrentes sem degradação.
- Teste de failover: derrubar um worker e verificar que outro assume os workflows pendentes.

## Emenda v1.1 — Agent Runtime como Workload do Temporal (Março 2026)

Com a arquitetura AI-Native, agentes autônomos passam a ser um tipo de workload orquestrado pelo Temporal.

### Novo Workflow: Agent Execution

```typescript
// workflows/agent-execution.workflow.ts
import { proxyActivities, sleep, condition } from '@temporalio/workflow';
import type * as activities from './agent-execution.activities';

const { executeAgentStep, evaluateDecision, requestHumanApproval,
        checkBudgetLimit, logAgentDecision } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2m',
  retry: { maximumAttempts: 3 },
});

export async function agentExecutionWorkflow(input: AgentInput): Promise<AgentResult> {
  let state = input.initialState;
  let totalCost = 0;
  const maxIterations = input.config.maxIterations ?? 10;

  for (let i = 0; i < maxIterations; i++) {
    // 1. Verificar budget
    const budgetOk = await checkBudgetLimit(input.tenantId, totalCost, input.config.maxCostUsd);
    if (!budgetOk) return { status: 'BUDGET_EXCEEDED', state, totalCost };

    // 2. Executar step do agente via AI Gateway
    const step = await executeAgentStep(input.tenantId, input.agentType, state);
    totalCost += step.cost;

    // 3. Se ação é destrutiva ou financeira → human-in-the-loop
    if (step.action?.requiresApproval) {
      const approved = await requestHumanApproval(input.tenantId, step);
      if (!approved) return { status: 'REJECTED_BY_HUMAN', state, totalCost };
    }

    // 4. Avaliar decisão e registrar no audit log
    await logAgentDecision(input.tenantId, input.agentType, step);

    // 5. Atualizar estado
    state = step.newState;

    // 6. Verificar se agente concluiu
    if (step.completed) return { status: 'COMPLETED', state, totalCost };
  }

  return { status: 'MAX_ITERATIONS_REACHED', state, totalCost };
}
```

### Workflows Adicionados

| Workflow | Duração Típica | Etapas | Saga |
|---|---|---|---|
| Agent Execution | 1-30 minutos | Variável (max configurable) | Não (stateful) |
| Decision Delegation | 1-60 segundos | 3 | Não |
| Policy Optimization | 1-5 minutos | 4 | Sim |

### Impacto

O Temporal passa a orquestrar não apenas workflows de negócio determinísticos, mas também workflows de agentes com decisões não-determinísticas. O circuit breaker de agentes (budget, iterações, tempo) é implementado como lógica do workflow, não do worker.

## Referências

- ADR 003 — Stripe Idempotency
- ADR 005 — Outbox Replay
- ADR 010 — Crypto Compliance AML
- ADR 013 — Trust Infrastructure
- ADR 024 — AI Gateway Routing
- ADR 028 — Runtime de Agentes
- ADR 029 — Decision Delegation
- REQ-BIZ-003 — Requisitos de Processos de Negócio
