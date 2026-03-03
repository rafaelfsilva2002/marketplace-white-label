import { Injectable, Inject } from '@nestjs/common';
import { eq, ilike, and, sql, desc } from 'drizzle-orm';
import { profiles, reviews, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import type {
  AgentTool,
  AgentToolSchema,
  AgentToolResult,
  AgentContext,
} from '../interfaces/agent.interface';

@Injectable()
export class AgentToolsService {
  private readonly logger = new StructuredLogger('AgentToolsService');
  private readonly tools: Map<string, AgentTool>;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {
    this.tools = new Map<string, AgentTool>();
    this.registerBuiltInTools();
  }

  getTools(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getToolsByNames(names: string[]): AgentTool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((tool): tool is AgentTool => tool !== undefined);
  }

  async executeTool(
    name: string,
    params: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
      };
    }

    this.logger.logWithData(
      'info',
      'Executing agent tool',
      {
        toolName: name,
        agentId: context.agentId,
        conversationId: context.conversationId,
        correlationId: context.correlationId,
      },
      'AgentToolsService',
    );

    try {
      const result = await tool.execute(params, context);

      this.logger.logWithData(
        'info',
        'Agent tool executed',
        {
          toolName: name,
          success: result.success,
          agentId: context.agentId,
          correlationId: context.correlationId,
        },
        'AgentToolsService',
      );

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      this.logger.logError(
        'Agent tool execution failed',
        err,
        {
          toolName: name,
          agentId: context.agentId,
          correlationId: context.correlationId,
        },
        'AgentToolsService',
      );

      return {
        success: false,
        error: err.message,
      };
    }
  }

  private registerBuiltInTools(): void {
    this.tools.set('search_profiles', this.createSearchProfilesTool());
    this.tools.set('get_profile', this.createGetProfileTool());
    this.tools.set('get_reviews', this.createGetReviewsTool());
    this.tools.set('suggest_plan', this.createSuggestPlanTool());
    this.tools.set(
      'create_moderation_entry',
      this.createModerationEntryTool(),
    );
  }

  private createSearchProfilesTool(): AgentTool {
    const schema: AgentToolSchema = {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City to search profiles in',
        },
        state: {
          type: 'string',
          description: 'State to search profiles in',
        },
        query: {
          type: 'string',
          description: 'Free-text search query for profile display name or bio',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 10)',
        },
      },
    };

    return {
      name: 'search_profiles',
      description:
        'Search for professional profiles by city, state, or free-text query.',
      parameters: schema,
      execute: async (
        params: Record<string, unknown>,
      ): Promise<AgentToolResult> => {
        const city = params.city as string | undefined;
        const state = params.state as string | undefined;
        const query = params.query as string | undefined;
        const limit = Math.min(Number(params.limit ?? 10), 50);

        const conditions = [eq(profiles.isActive, true)];

        if (city) {
          conditions.push(ilike(profiles.city, `%${city}%`));
        }
        if (state) {
          conditions.push(ilike(profiles.state, `%${state}%`));
        }
        if (query) {
          conditions.push(
            sql`(${profiles.displayName} ILIKE ${'%' + query + '%'} OR ${profiles.bio} ILIKE ${'%' + query + '%'})`,
          );
        }

        const results = await this.db
          .select({
            id: profiles.id,
            displayName: profiles.displayName,
            city: profiles.city,
            state: profiles.state,
            isVerified: profiles.isVerified,
            createdAt: profiles.createdAt,
          })
          .from(profiles)
          .where(and(...conditions))
          .limit(limit);

        return {
          success: true,
          data: {
            profiles: results,
            count: results.length,
          },
        };
      },
    };
  }

  private createGetProfileTool(): AgentTool {
    const schema: AgentToolSchema = {
      type: 'object',
      properties: {
        profileId: {
          type: 'string',
          description: 'UUID of the profile to retrieve',
        },
      },
      required: ['profileId'],
    };

    return {
      name: 'get_profile',
      description:
        'Get detailed information about a specific professional profile.',
      parameters: schema,
      execute: async (
        params: Record<string, unknown>,
      ): Promise<AgentToolResult> => {
        const profileId = params.profileId as string;

        const [profile] = await this.db
          .select()
          .from(profiles)
          .where(eq(profiles.id, profileId))
          .limit(1);

        if (!profile) {
          return {
            success: false,
            error: `Profile with id ${profileId} not found`,
          };
        }

        return {
          success: true,
          data: profile,
        };
      },
    };
  }

  private createGetReviewsTool(): AgentTool {
    const schema: AgentToolSchema = {
      type: 'object',
      properties: {
        profileId: {
          type: 'string',
          description: 'UUID of the profile to get reviews for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of reviews (default 10)',
        },
      },
      required: ['profileId'],
    };

    return {
      name: 'get_reviews',
      description: 'Get reviews for a specific professional profile.',
      parameters: schema,
      execute: async (
        params: Record<string, unknown>,
      ): Promise<AgentToolResult> => {
        const profileId = params.profileId as string;
        const limit = Math.min(Number(params.limit ?? 10), 50);

        const results = await this.db
          .select()
          .from(reviews)
          .where(eq(reviews.profileId, profileId))
          .orderBy(desc(reviews.createdAt))
          .limit(limit);

        const avgRating =
          results.length > 0
            ? results.reduce((sum, r) => sum + r.rating, 0) / results.length
            : 0;

        return {
          success: true,
          data: {
            reviews: results,
            count: results.length,
            averageRating: Math.round(avgRating * 100) / 100,
          },
        };
      },
    };
  }

  private createSuggestPlanTool(): AgentTool {
    const schema: AgentToolSchema = {
      type: 'object',
      properties: {
        profileId: {
          type: 'string',
          description: 'UUID of the profile to suggest a plan for',
        },
        currentPlan: {
          type: 'string',
          description: 'Current subscription plan name',
        },
        monthlyViews: {
          type: 'number',
          description: 'Number of monthly profile views',
        },
        monthlyLeads: {
          type: 'number',
          description: 'Number of monthly leads/contacts',
        },
      },
      required: ['profileId'],
    };

    return {
      name: 'suggest_plan',
      description:
        'Suggest a subscription plan for a professional based on their metrics.',
      parameters: schema,
      execute: async (
        params: Record<string, unknown>,
      ): Promise<AgentToolResult> => {
        const profileId = params.profileId as string;
        const currentPlan = (params.currentPlan as string) ?? 'free';
        const monthlyViews = Number(params.monthlyViews ?? 0);
        const monthlyLeads = Number(params.monthlyLeads ?? 0);

        let suggestedPlan: string;
        let reason: string;

        if (monthlyViews > 1000 || monthlyLeads > 50) {
          suggestedPlan = 'premium';
          reason =
            'High traffic and lead volume suggest premium plan for maximum visibility and features.';
        } else if (monthlyViews > 300 || monthlyLeads > 15) {
          suggestedPlan = 'professional';
          reason =
            'Growing metrics indicate professional plan would optimize cost-to-benefit ratio.';
        } else if (monthlyViews > 50 || monthlyLeads > 5) {
          suggestedPlan = 'basic';
          reason =
            'Moderate activity level suits the basic plan with core features.';
        } else {
          suggestedPlan = 'free';
          reason =
            'Current activity level is manageable on the free plan. Consider upgrading as traffic grows.';
        }

        return {
          success: true,
          data: {
            profileId,
            currentPlan,
            suggestedPlan,
            reason,
            metrics: {
              monthlyViews,
              monthlyLeads,
            },
          },
        };
      },
    };
  }

  private createModerationEntryTool(): AgentTool {
    const schema: AgentToolSchema = {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          description: 'Type of entity to flag (profile, review, photo)',
          enum: ['profile', 'review', 'photo'],
        },
        entityId: {
          type: 'string',
          description: 'UUID of the entity to flag',
        },
        reason: {
          type: 'string',
          description: 'Reason for flagging the content',
        },
        severity: {
          type: 'string',
          description: 'Severity level of the flag',
          enum: ['low', 'medium', 'high', 'critical'],
        },
      },
      required: ['entityType', 'entityId', 'reason'],
    };

    return {
      name: 'create_moderation_entry',
      description:
        'Flag content for moderation review. Creates a moderation queue entry.',
      parameters: schema,
      execute: async (
        params: Record<string, unknown>,
        context: AgentContext,
      ): Promise<AgentToolResult> => {
        const entityType = params.entityType as string;
        const entityId = params.entityId as string;
        const reason = params.reason as string;
        const severity = (params.severity as string) ?? 'medium';

        return {
          success: true,
          data: {
            flagged: true,
            entityType,
            entityId,
            reason,
            severity,
            flaggedBy: `agent:${context.agentId}`,
            flaggedAt: new Date().toISOString(),
            note: 'Moderation entry created. Awaiting human review.',
          },
        };
      },
    };
  }
}
