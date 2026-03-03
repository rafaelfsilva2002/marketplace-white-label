// ── Agent Tool ────────────────────────────────────────────────────────

export interface AgentToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: AgentToolParameter;
  properties?: Record<string, AgentToolParameter>;
  required?: string[];
}

export interface AgentToolSchema {
  type: 'object';
  properties: Record<string, AgentToolParameter>;
  required?: string[];
}

export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: AgentToolSchema;
  execute(
    params: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentToolResult>;
}

// ── Agent Config ─────────────────────────────────────────────────────

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools: AgentTool[];
}

// ── Agent Context ────────────────────────────────────────────────────

export interface AgentContext {
  agentId: string;
  conversationId: string;
  userId: string;
  correlationId: string;
}

// ── Risk Classification ──────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskClassification {
  level: RiskLevel;
  reason: string;
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface CreateAgentInput {
  name: string;
  type: 'moderator' | 'assistant' | 'analyst' | 'pricing';
  description?: string;
  systemPrompt: string;
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
    autonomyLevel?: 'low' | 'medium' | 'high';
  };
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  status?: 'active' | 'paused' | 'disabled';
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
    autonomyLevel?: 'low' | 'medium' | 'high';
  };
}

export interface ChatInput {
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  conversationId: string;
  message: {
    id: string;
    role: 'assistant';
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
    tokens?: number;
    costUsd?: number;
  };
}
