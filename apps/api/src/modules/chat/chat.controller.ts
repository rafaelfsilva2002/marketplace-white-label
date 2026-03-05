import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10) || 20));

    const result = await this.chatService.getConversations(
      user.id,
      pageNum,
      limitNum,
    );

    return { success: true, data: result };
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '50', 10) || 50));

    const result = await this.chatService.getMessages(
      id,
      user.id,
      pageNum,
      limitNum,
    );

    return { success: true, data: result };
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  async createConversation(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateConversationDto,
  ) {
    const conversation = await this.chatService.getOrCreateConversation(
      user.id,
      dto.participantId,
    );

    return { success: true, data: conversation };
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.chatService.sendMessage(
      id,
      user.id,
      dto.content,
      dto.type,
    );

    return { success: true, data: message };
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.chatService.markAsRead(id, user.id);
    return { success: true, data: result };
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: JwtUser) {
    const count = await this.chatService.getUnreadCount(user.id);
    return { success: true, data: { unreadCount: count } };
  }
}
