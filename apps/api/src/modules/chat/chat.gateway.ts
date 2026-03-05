import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  private readonly userSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    if (!userId) {
      this.logger.warn(`Unauthorized connection attempt: ${client.id}`);
      client.disconnect();
      return;
    }

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    client.data.userId = userId;
    client.join(`user:${userId}`);
    this.logger.log(`Client connected to /chat: ${client.id} (user: ${userId})`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected from /chat: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      // Validate participant access
      const conv = await this.chatService.getConversationById(data.conversationId);
      if (conv.participantOneId !== userId && conv.participantTwoId !== userId) {
        client.emit('error', { message: 'Not a participant of this conversation' });
        return;
      }

      client.join(`conversation:${data.conversationId}`);
      client.emit('joined_conversation', { conversationId: data.conversationId });

      this.logger.log({
        message: 'User joined conversation room',
        userId,
        conversationId: data.conversationId,
      });
    } catch (error) {
      client.emit('error', { message: 'Failed to join conversation' });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; content: string; type?: 'text' | 'image' | 'system' },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const message = await this.chatService.sendMessage(
        data.conversationId,
        userId,
        data.content,
        data.type || 'text',
      );

      // Emit to all participants in the conversation room
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('new_message', message);

      // Also notify the other participant if they are online but not in the room
      const conv = await this.chatService.getConversationById(data.conversationId);
      const otherUserId =
        conv.participantOneId === userId
          ? conv.participantTwoId
          : conv.participantOneId;

      this.server.to(`user:${otherUserId}`).emit('message_notification', {
        conversationId: data.conversationId,
        message,
      });
    } catch (error) {
      client.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    // Broadcast typing status to the conversation room (excluding sender)
    client.to(`conversation:${data.conversationId}`).emit('user_typing', {
      conversationId: data.conversationId,
      userId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const result = await this.chatService.markAsRead(data.conversationId, userId);

      // Notify the conversation room about read receipt
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('messages_read', {
          conversationId: data.conversationId,
          readBy: userId,
          markedCount: result.markedCount,
        });
    } catch (error) {
      client.emit('error', { message: 'Failed to mark messages as read' });
    }
  }

  private extractUserId(client: Socket): string | null {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return null;
    try {
      const payload: JwtPayload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      return payload.sub;
    } catch {
      return null;
    }
  }
}
