import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Headers,
  Logger,
  Request,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole, ApiResponse } from '@marketplace/shared';
import { AgentService } from '../services/agent.service';
import { DecisionDelegationService } from '../services/decision-delegation.service';
import { CreateAgentDto } from '../dto/create-agent.dto';
import { UpdateAgentDto } from '../dto/update-agent.dto';
import { ChatDto } from '../dto/chat.dto';

@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly decisionDelegation: DecisionDelegationService,
  ) {}

  // ── Agent CRUD ──────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.Admin)
  @HttpCode(HttpStatus.CREATED)
  async createAgent(
    @Body() dto: CreateAgentDto,
    @Request() req: { user: { id: string } },
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();
    const agent = await this.agentService.createAgent(dto, req.user.id, correlationId);
    return { success: true, data: agent };
  }

  @Get()
  @Roles(UserRole.Admin)
  async listAgents(): Promise<ApiResponse<unknown>> {
    const agents = await this.agentService.listAgents();
    return { success: true, data: agents };
  }

  @Get(':id')
  @Roles(UserRole.Admin)
  async getAgent(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<unknown>> {
    const agent = await this.agentService.getAgent(id);
    return { success: true, data: agent };
  }

  @Put(':id')
  @Roles(UserRole.Admin)
  async updateAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @Request() req: { user: { id: string } },
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();
    const agent = await this.agentService.updateAgent(id, dto, req.user.id, correlationId);
    return { success: true, data: agent };
  }

  // ── Chat ────────────────────────────────────────────────────────

  @Post(':id/chat')
  @Roles(UserRole.Admin, UserRole.Moderator)
  @HttpCode(HttpStatus.OK)
  async chat(
    @Param('id', ParseUUIDPipe) agentId: string,
    @Body() dto: ChatDto,
    @Request() req: { user: { id: string } },
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();
    const response = await this.agentService.chat(
      agentId,
      req.user.id,
      dto.message,
      correlationId,
    );
    return { success: true, data: response };
  }

  // ── Conversations ───────────────────────────────────────────────

  @Get(':id/conversations')
  @Roles(UserRole.Admin, UserRole.Moderator)
  async listConversations(
    @Param('id', ParseUUIDPipe) agentId: string,
    @Query('userId') userId?: string,
  ): Promise<ApiResponse<unknown>> {
    const conversations = await this.agentService.listConversations(agentId, userId);
    return { success: true, data: conversations };
  }

  @Get('conversations/:conversationId')
  @Roles(UserRole.Admin, UserRole.Moderator)
  async getConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<ApiResponse<unknown>> {
    const conversation = await this.agentService.getConversation(conversationId);
    return { success: true, data: conversation };
  }

  // ── Decision Delegation ─────────────────────────────────────────

  @Get('actions/pending')
  @Roles(UserRole.Admin, UserRole.Moderator)
  async getPendingActions(
    @Query('agentId') agentId?: string,
  ): Promise<ApiResponse<unknown>> {
    const actions = await this.decisionDelegation.getPendingActions(agentId);
    return { success: true, data: actions };
  }

  @Post('actions/:actionId/approve')
  @Roles(UserRole.Admin, UserRole.Moderator)
  @HttpCode(HttpStatus.OK)
  async approveAction(
    @Param('actionId', ParseUUIDPipe) actionId: string,
    @Request() req: { user: { id: string } },
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();
    const action = await this.decisionDelegation.approveAction(
      actionId,
      req.user.id,
      correlationId,
    );
    return { success: true, data: action };
  }

  @Post('actions/:actionId/reject')
  @Roles(UserRole.Admin, UserRole.Moderator)
  @HttpCode(HttpStatus.OK)
  async rejectAction(
    @Param('actionId', ParseUUIDPipe) actionId: string,
    @Body('reason') reason: string,
    @Request() req: { user: { id: string } },
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();
    const action = await this.decisionDelegation.rejectAction(
      actionId,
      reason,
      req.user.id,
      correlationId,
    );
    return { success: true, data: action };
  }

  @Get('actions/stats')
  @Roles(UserRole.Admin)
  async getActionStats(
    @Query('agentId') agentId?: string,
  ): Promise<ApiResponse<unknown>> {
    const stats = await this.decisionDelegation.getActionStats(agentId);
    return { success: true, data: stats };
  }
}
