import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, desc, count, avg, sql } from 'drizzle-orm';
import {
  agentActions,
  aiAgents,
  type Database,
  type AgentAction,
  type AgentConfigJson,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import type { RiskLevel, RiskClassification } from '../interfaces/agent.interface';

// ── Risk classification map ──────────────────────────────────────────

const ACTION_RISK_MAP: Record<string, RiskLevel> = {
  // LOW risk — auto-execute
  search_profiles: 'low',
  get_profile: 'low',
  get_reviews: 'low',
  suggest_plan: 'low',
  read_data: 'low',

  // MEDIUM risk — conditional
  update_profile: 'medium',
  respond_to_review: 'medium',
  send_notification: 'medium',
  create_moderation_entry: 'medium',

  // HIGH risk — always require human approval
  deactivate_profile: 'high',
  process_payment: 'high',
  ban_user: 'high',
  delete_content: 'high',
  refund_payment: 'high',
};

const APPROVAL_RATE_THRESHOLD = 0.95;
const MINIMUM_ACTIONS_FOR_AUTO = 20;

export interface ActionStats {
  totalActions: number;
  pendingActions: number;
  approvedActions: number;
  rejectedActions: number;
  executedActions: number;
  approvalRate: number;
  avgResponseTimeMs: number | null;
}

@Injectable()
export class DecisionDelegationService {
  private readonly logger = new StructuredLogger('DecisionDelegationService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  // ── Request action ─────────────────────────────────────────────────

  async requestAction(
    agentId: string,
    conversationId: string | null,
    actionType: string,
    params: Record<string, unknown>,
    correlationId?: string,
  ): Promise<AgentAction> {
    const corrId = correlationId ?? getCorrelationId();

    const [agent] = await this.db
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new NotFoundException(`Agent with id ${agentId} not found`);
    }

    const risk = this.classifyRisk(actionType);
    const shouldAutoExecute = await this.shouldAutoExecute(
      agent,
      risk,
    );

    const [action] = await this.db
      .insert(agentActions)
      .values({
        agentId,
        conversationId,
        actionType,
        params,
        status: shouldAutoExecute ? 'executed' : 'pending',
        executedAt: shouldAutoExecute ? new Date() : null,
      })
      .returning();

    // Emit outbox event
    const eventType = shouldAutoExecute
      ? 'marketplace.agent.action.executed'
      : 'marketplace.agent.action.requested';

    await this.outboxService.writeEvent(this.db as never, {
      eventType,
      aggregateType: 'agent_action',
      aggregateId: action.id,
      payload: {
        actionId: action.id,
        agentId,
        conversationId,
        actionType,
        riskLevel: risk.level,
        riskReason: risk.reason,
        autoExecuted: shouldAutoExecute,
      },
      correlationId: corrId,
    });

    await this.auditService.record({
      action: shouldAutoExecute
        ? 'agent.action.auto_executed'
        : 'agent.action.requested',
      entityType: 'agent_action',
      entityId: action.id,
      newValue: {
        agentId,
        actionType,
        riskLevel: risk.level,
        autoExecuted: shouldAutoExecute,
      } as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      shouldAutoExecute
        ? 'Agent action auto-executed'
        : 'Agent action queued for approval',
      {
        actionId: action.id,
        agentId,
        actionType,
        riskLevel: risk.level,
        autoExecuted: shouldAutoExecute,
        correlationId: corrId,
      },
      'DecisionDelegationService',
    );

    return action;
  }

  // ── Approve action ─────────────────────────────────────────────────

  async approveAction(
    actionId: string,
    approverId: string,
    correlationId?: string,
  ): Promise<AgentAction> {
    const corrId = correlationId ?? getCorrelationId();
    const action = await this.getAction(actionId);

    if (action.status !== 'pending') {
      throw new BadRequestException(
        `Action is not pending (current status: ${action.status})`,
      );
    }

    const [updated] = await this.db
      .update(agentActions)
      .set({
        status: 'approved',
        approvedBy: approverId,
        executedAt: new Date(),
      })
      .where(eq(agentActions.id, actionId))
      .returning();

    await this.outboxService.writeEvent(this.db as never, {
      eventType: 'marketplace.agent.action.approved',
      aggregateType: 'agent_action',
      aggregateId: actionId,
      payload: {
        actionId,
        agentId: action.agentId,
        actionType: action.actionType,
        approverId,
        params: action.params,
      },
      correlationId: corrId,
    });

    await this.auditService.record({
      userId: approverId,
      action: 'agent.action.approved',
      entityType: 'agent_action',
      entityId: actionId,
      oldValue: { status: 'pending' } as Record<string, unknown>,
      newValue: {
        status: 'approved',
        approvedBy: approverId,
      } as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Agent action approved',
      {
        actionId,
        agentId: action.agentId,
        actionType: action.actionType,
        approverId,
        correlationId: corrId,
      },
      'DecisionDelegationService',
    );

    return updated;
  }

  // ── Reject action ──────────────────────────────────────────────────

  async rejectAction(
    actionId: string,
    approverId: string,
    reason: string,
    correlationId?: string,
  ): Promise<AgentAction> {
    const corrId = correlationId ?? getCorrelationId();
    const action = await this.getAction(actionId);

    if (action.status !== 'pending') {
      throw new BadRequestException(
        `Action is not pending (current status: ${action.status})`,
      );
    }

    const [updated] = await this.db
      .update(agentActions)
      .set({
        status: 'rejected',
        approvedBy: approverId,
        rejectionReason: reason,
      })
      .where(eq(agentActions.id, actionId))
      .returning();

    await this.outboxService.writeEvent(this.db as never, {
      eventType: 'marketplace.agent.action.rejected',
      aggregateType: 'agent_action',
      aggregateId: actionId,
      payload: {
        actionId,
        agentId: action.agentId,
        actionType: action.actionType,
        approverId,
        reason,
      },
      correlationId: corrId,
    });

    await this.auditService.record({
      userId: approverId,
      action: 'agent.action.rejected',
      entityType: 'agent_action',
      entityId: actionId,
      oldValue: { status: 'pending' } as Record<string, unknown>,
      newValue: {
        status: 'rejected',
        approvedBy: approverId,
        rejectionReason: reason,
      } as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Agent action rejected',
      {
        actionId,
        agentId: action.agentId,
        actionType: action.actionType,
        approverId,
        reason,
        correlationId: corrId,
      },
      'DecisionDelegationService',
    );

    return updated;
  }

  // ── List pending actions ───────────────────────────────────────────

  async getPendingActions(filters?: {
    agentId?: string;
    actionType?: string;
  }): Promise<AgentAction[]> {
    const conditions = [eq(agentActions.status, 'pending')];

    if (filters?.agentId) {
      conditions.push(eq(agentActions.agentId, filters.agentId));
    }
    if (filters?.actionType) {
      conditions.push(eq(agentActions.actionType, filters.actionType));
    }

    return this.db
      .select()
      .from(agentActions)
      .where(and(...conditions))
      .orderBy(desc(agentActions.createdAt));
  }

  // ── Stats ──────────────────────────────────────────────────────────

  async getActionStats(agentId?: string): Promise<ActionStats> {
    const conditions = agentId
      ? [eq(agentActions.agentId, agentId)]
      : [];

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(whereClause);

    const [pendingResult] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(
        whereClause
          ? and(whereClause, eq(agentActions.status, 'pending'))
          : eq(agentActions.status, 'pending'),
      );

    const [approvedResult] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(
        whereClause
          ? and(whereClause, eq(agentActions.status, 'approved'))
          : eq(agentActions.status, 'approved'),
      );

    const [rejectedResult] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(
        whereClause
          ? and(whereClause, eq(agentActions.status, 'rejected'))
          : eq(agentActions.status, 'rejected'),
      );

    const [executedResult] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(
        whereClause
          ? and(whereClause, eq(agentActions.status, 'executed'))
          : eq(agentActions.status, 'executed'),
      );

    const totalActions = totalResult.value;
    const pendingActions = pendingResult.value;
    const approvedActions = approvedResult.value;
    const rejectedActions = rejectedResult.value;
    const executedActions = executedResult.value;

    const decidedActions = approvedActions + rejectedActions;
    const approvalRate =
      decidedActions > 0 ? approvedActions / decidedActions : 0;

    // Average response time for decided actions (approved + rejected)
    const [avgResult] = await this.db
      .select({
        value: sql<number>`AVG(
          EXTRACT(EPOCH FROM (
            COALESCE(${agentActions.executedAt}, NOW()) - ${agentActions.createdAt}
          )) * 1000
        )`.as('avg_response_time'),
      })
      .from(agentActions)
      .where(
        whereClause
          ? and(
              whereClause,
              sql`${agentActions.status} IN ('approved', 'rejected')`,
            )
          : sql`${agentActions.status} IN ('approved', 'rejected')`,
      );

    return {
      totalActions,
      pendingActions,
      approvedActions,
      rejectedActions,
      executedActions,
      approvalRate: Math.round(approvalRate * 10000) / 10000,
      avgResponseTimeMs: avgResult.value ? Math.round(avgResult.value) : null,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async getAction(actionId: string): Promise<AgentAction> {
    const [action] = await this.db
      .select()
      .from(agentActions)
      .where(eq(agentActions.id, actionId))
      .limit(1);

    if (!action) {
      throw new NotFoundException(`Action with id ${actionId} not found`);
    }

    return action;
  }

  classifyRisk(actionType: string): RiskClassification {
    const level = ACTION_RISK_MAP[actionType] ?? 'high';

    const reasons: Record<RiskLevel, string> = {
      low: 'Read-only or suggestion action — safe for auto-execution.',
      medium:
        'Modifying action — may be auto-executed if agent has high approval history.',
      high: 'Critical action — always requires human approval.',
    };

    return {
      level,
      reason: reasons[level],
    };
  }

  private async shouldAutoExecute(
    agent: { id: string; config: unknown },
    risk: RiskClassification,
  ): Promise<boolean> {
    if (risk.level === 'low') {
      return true;
    }

    if (risk.level === 'high') {
      return false;
    }

    // MEDIUM risk — check agent autonomy level and approval history
    const agentConfig = (agent.config ?? {}) as AgentConfigJson;
    const autonomyLevel = agentConfig.autonomyLevel ?? 'low';

    if (autonomyLevel === 'low') {
      return false;
    }

    if (autonomyLevel === 'high') {
      // Check approval history before auto-executing
      const stats = await this.getAgentApprovalStats(agent.id);

      if (
        stats.totalDecided >= MINIMUM_ACTIONS_FOR_AUTO &&
        stats.approvalRate >= APPROVAL_RATE_THRESHOLD
      ) {
        return true;
      }
    }

    // For medium autonomy or insufficient history, queue for approval
    return false;
  }

  private async getAgentApprovalStats(
    agentId: string,
  ): Promise<{ totalDecided: number; approvalRate: number }> {
    const [approvedCount] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.agentId, agentId),
          eq(agentActions.status, 'approved'),
        ),
      );

    const [rejectedCount] = await this.db
      .select({ value: count() })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.agentId, agentId),
          eq(agentActions.status, 'rejected'),
        ),
      );

    const totalDecided = approvedCount.value + rejectedCount.value;
    const approvalRate =
      totalDecided > 0 ? approvedCount.value / totalDecided : 0;

    return { totalDecided, approvalRate };
  }
}
