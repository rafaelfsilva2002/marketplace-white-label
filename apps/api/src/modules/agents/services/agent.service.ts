import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, desc, asc } from 'drizzle-orm';
import {
  aiAgents,
  agentConversations,
  agentMessages,
  type Database,
  type AIAgent,
  type AgentConversation,
  type AgentMessage,
  type NewAgentMessage,
  type AgentConfigJson,
} from '@marketplace/database';
import type { AIGateway, CompletionMessage } from '@marketplace/ai-gateway';
import { DATABASE_TOKEN } from '@/config/database.config';
import { AI_GATEWAY_TOKEN } from '@/config/ai-gateway.config';
import { AuditService } from '@/modules/audit/audit.service';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { AgentToolsService } from './agent-tools.service';
import type {
  CreateAgentInput,
  UpdateAgentInput,
  ChatResponse,
  AgentContext,
} from '../interfaces/agent.interface';

@Injectable()
export class AgentService {
  private readonly logger = new StructuredLogger('AgentService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(AI_GATEWAY_TOKEN) private readonly aiGateway: AIGateway,
    private readonly auditService: AuditService,
    private readonly agentToolsService: AgentToolsService,
  ) {}

  // ── Agent CRUD ───────────────────────────────────────────────────

  async createAgent(
    input: CreateAgentInput,
    userId: string,
    correlationId?: string,
  ): Promise<AIAgent> {
    const corrId = correlationId ?? getCorrelationId();

    const [agent] = await this.db
      .insert(aiAgents)
      .values({
        name: input.name,
        type: input.type,
        description: input.description,
        systemPrompt: input.systemPrompt,
        config: (input.config ?? {}) as AgentConfigJson,
      })
      .returning();

    await this.auditService.record({
      userId,
      action: 'agent.created',
      entityType: 'ai_agent',
      entityId: agent.id,
      newValue: {
        name: agent.name,
        type: agent.type,
      } as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'AI agent created',
      {
        agentId: agent.id,
        name: agent.name,
        type: agent.type,
        userId,
        correlationId: corrId,
      },
      'AgentService',
    );

    return agent;
  }

  async getAgent(id: string): Promise<AIAgent> {
    const [agent] = await this.db
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.id, id))
      .limit(1);

    if (!agent) {
      throw new NotFoundException(`Agent with id ${id} not found`);
    }

    return agent;
  }

  async listAgents(): Promise<AIAgent[]> {
    return this.db
      .select()
      .from(aiAgents)
      .orderBy(desc(aiAgents.createdAt));
  }

  async updateAgent(
    id: string,
    input: UpdateAgentInput,
    userId: string,
    correlationId?: string,
  ): Promise<AIAgent> {
    const corrId = correlationId ?? getCorrelationId();
    const existing = await this.getAgent(id);

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.systemPrompt !== undefined) {
      updateData.systemPrompt = input.systemPrompt;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.config !== undefined) {
      updateData.config = {
        ...((existing.config as AgentConfigJson) ?? {}),
        ...input.config,
      };
    }

    const [updated] = await this.db
      .update(aiAgents)
      .set(updateData)
      .where(eq(aiAgents.id, id))
      .returning();

    await this.auditService.record({
      userId,
      action: 'agent.updated',
      entityType: 'ai_agent',
      entityId: id,
      oldValue: {
        name: existing.name,
        status: existing.status,
      } as Record<string, unknown>,
      newValue: updateData,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'AI agent updated',
      {
        agentId: id,
        userId,
        correlationId: corrId,
      },
      'AgentService',
    );

    return updated;
  }

  // ── Chat ─────────────────────────────────────────────────────────

  async chat(
    agentId: string,
    userId: string,
    message: string,
    correlationId?: string,
  ): Promise<ChatResponse> {
    const corrId = correlationId ?? getCorrelationId();
    const agent = await this.getAgent(agentId);

    if (agent.status !== 'active') {
      throw new BadRequestException(
        `Agent "${agent.name}" is not active (status: ${agent.status})`,
      );
    }

    const conversation = await this.getOrCreateConversation(
      agentId,
      userId,
      corrId,
    );

    const history = await this.loadConversationHistory(conversation.id);

    const messages = this.buildMessages(agent, history, message);

    // Store user message
    const [userMessage] = await this.db
      .insert(agentMessages)
      .values({
        conversationId: conversation.id,
        role: 'user',
        content: message,
      })
      .returning();

    // Call AI Gateway
    const agentConfig = (agent.config ?? {}) as AgentConfigJson;

    const completion = await this.aiGateway.complete({
      messages,
      model: agentConfig.model,
      temperature: agentConfig.temperature ?? 0.7,
      maxTokens: agentConfig.maxTokens ?? 2048,
      userId,
      correlationId: corrId,
    });

    // Process tool calls if the response indicates tool usage
    let finalContent = completion.content;
    const toolCallResults = await this.processToolCalls(
      completion.content,
      {
        agentId,
        conversationId: conversation.id,
        userId,
        correlationId: corrId,
      },
    );

    if (toolCallResults.length > 0) {
      // If tools were called, make a follow-up completion with tool results
      const toolResultsText = toolCallResults
        .map(
          (tr) =>
            `[Tool: ${tr.name}] ${tr.success ? JSON.stringify(tr.result) : `Error: ${tr.error}`}`,
        )
        .join('\n');

      const followUpMessages: CompletionMessage[] = [
        ...messages,
        { role: 'assistant', content: completion.content },
        { role: 'user', content: `Tool results:\n${toolResultsText}` },
      ];

      const followUp = await this.aiGateway.complete({
        messages: followUpMessages,
        model: agentConfig.model,
        temperature: agentConfig.temperature ?? 0.7,
        maxTokens: agentConfig.maxTokens ?? 2048,
        userId,
        correlationId: corrId,
      });

      finalContent = followUp.content;

      // Store tool message
      await this.db.insert(agentMessages).values({
        conversationId: conversation.id,
        role: 'tool',
        content: toolResultsText,
        toolResults: toolCallResults.map((tr) => ({
          callId: tr.callId,
          name: tr.name,
          result: tr.result,
          error: tr.error,
        })),
        tokens: followUp.usage.totalTokens,
        costUsd: followUp.costUsd,
      } as NewAgentMessage);
    }

    // Store assistant response
    const [assistantMessage] = await this.db
      .insert(agentMessages)
      .values({
        conversationId: conversation.id,
        role: 'assistant',
        content: finalContent,
        tokens: completion.usage.totalTokens,
        costUsd: completion.costUsd,
      })
      .returning();

    // Update conversation context with latest interaction timestamp
    await this.db
      .update(agentConversations)
      .set({
        context: {
          ...(conversation.context as Record<string, unknown>),
          lastInteraction: new Date().toISOString(),
          messageCount:
            (
              (conversation.context as Record<string, unknown>)
                ?.messageCount as number ?? 0
            ) + 2,
        },
        updatedAt: new Date(),
      })
      .where(eq(agentConversations.id, conversation.id));

    this.logger.logWithData(
      'info',
      'Agent chat completed',
      {
        agentId,
        conversationId: conversation.id,
        userId,
        tokens: completion.usage.totalTokens,
        costUsd: completion.costUsd,
        toolCallCount: toolCallResults.length,
        correlationId: corrId,
      },
      'AgentService',
    );

    return {
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: finalContent,
        tokens: completion.usage.totalTokens,
        costUsd: completion.costUsd,
      },
    };
  }

  // ── Conversations ────────────────────────────────────────────────

  async getConversation(
    conversationId: string,
  ): Promise<AgentConversation & { messages: AgentMessage[] }> {
    const [conversation] = await this.db
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(
        `Conversation with id ${conversationId} not found`,
      );
    }

    const messages = await this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(asc(agentMessages.createdAt));

    return { ...conversation, messages };
  }

  async listConversations(
    agentId: string,
    userId?: string,
  ): Promise<AgentConversation[]> {
    const conditions = [eq(agentConversations.agentId, agentId)];

    if (userId) {
      conditions.push(eq(agentConversations.userId, userId));
    }

    return this.db
      .select()
      .from(agentConversations)
      .where(and(...conditions))
      .orderBy(desc(agentConversations.updatedAt));
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async getOrCreateConversation(
    agentId: string,
    userId: string,
    correlationId: string,
  ): Promise<AgentConversation> {
    // Find an existing active conversation for this agent+user pair
    const [existing] = await this.db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.agentId, agentId),
          eq(agentConversations.userId, userId),
          eq(agentConversations.status, 'active'),
        ),
      )
      .orderBy(desc(agentConversations.updatedAt))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Create new conversation
    const [conversation] = await this.db
      .insert(agentConversations)
      .values({
        agentId,
        userId,
        status: 'active',
        context: {
          startedAt: new Date().toISOString(),
          messageCount: 0,
        },
        metadata: {
          correlationId,
        },
      })
      .returning();

    this.logger.logWithData(
      'info',
      'New agent conversation created',
      {
        conversationId: conversation.id,
        agentId,
        userId,
        correlationId,
      },
      'AgentService',
    );

    return conversation;
  }

  private async loadConversationHistory(
    conversationId: string,
  ): Promise<AgentMessage[]> {
    return this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(asc(agentMessages.createdAt));
  }

  private buildMessages(
    agent: AIAgent,
    history: AgentMessage[],
    newMessage: string,
  ): CompletionMessage[] {
    const messages: CompletionMessage[] = [];

    // System prompt
    const agentConfig = (agent.config ?? {}) as AgentConfigJson;
    const toolNames = agentConfig.tools ?? [];
    const availableTools = this.agentToolsService.getToolsByNames(toolNames);

    let systemContent = agent.systemPrompt;

    if (availableTools.length > 0) {
      const toolDescriptions = availableTools
        .map(
          (t) =>
            `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}`,
        )
        .join('\n');

      systemContent += `\n\nYou have access to the following tools. To use a tool, respond with a JSON block in this format:\n\`\`\`tool_call\n{"tool": "<tool_name>", "arguments": {<parameters>}}\n\`\`\`\n\nAvailable tools:\n${toolDescriptions}`;
    }

    messages.push({ role: 'system', content: systemContent });

    // Conversation history (exclude system messages already embedded)
    for (const msg of history) {
      if (msg.role === 'system') {
        continue;
      }

      const role = msg.role === 'tool' ? 'user' : msg.role;
      messages.push({
        role: role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // New user message
    messages.push({ role: 'user', content: newMessage });

    return messages;
  }

  private async processToolCalls(
    content: string,
    context: AgentContext,
  ): Promise<
    Array<{
      callId: string;
      name: string;
      success: boolean;
      result?: unknown;
      error?: string;
    }>
  > {
    const toolCallRegex = /```tool_call\s*\n([\s\S]*?)\n```/g;
    const results: Array<{
      callId: string;
      name: string;
      success: boolean;
      result?: unknown;
      error?: string;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as {
          tool: string;
          arguments: Record<string, unknown>;
        };

        const callId = `call_${Date.now()}_${results.length}`;

        const toolResult = await this.agentToolsService.executeTool(
          parsed.tool,
          parsed.arguments,
          context,
        );

        results.push({
          callId,
          name: parsed.tool,
          success: toolResult.success,
          result: toolResult.data,
          error: toolResult.error,
        });
      } catch (parseError) {
        this.logger.logWithData(
          'warn',
          'Failed to parse tool call from agent response',
          {
            content: match[1],
            agentId: context.agentId,
            correlationId: context.correlationId,
          },
          'AgentService',
        );
      }
    }

    return results;
  }
}
