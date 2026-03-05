import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, or, desc, count, sql } from 'drizzle-orm';
import {
  conversations,
  messages,
  users,
  type Database,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { Logger } from '@nestjs/common';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async getOrCreateConversation(userOneId: string, userTwoId: string) {
    // Always store with the smaller UUID as participantOne for unique constraint consistency
    const [pOne, pTwo] =
      userOneId < userTwoId
        ? [userOneId, userTwoId]
        : [userTwoId, userOneId];

    const existing = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.participantOneId, pOne),
          eq(conversations.participantTwoId, pTwo),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [created] = await this.db
      .insert(conversations)
      .values({
        participantOneId: pOne,
        participantTwoId: pTwo,
      })
      .returning();

    this.logger.log({
      message: 'Conversation created',
      conversationId: created.id,
      participants: [pOne, pTwo],
    });

    return created;
  }

  async getConversations(userId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const whereClause = and(
      or(
        eq(conversations.participantOneId, userId),
        eq(conversations.participantTwoId, userId),
      ),
      eq(conversations.isActive, true),
    );

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(conversations)
      .where(whereClause);

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select({
        id: conversations.id,
        participantOneId: conversations.participantOneId,
        participantTwoId: conversations.participantTwoId,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        isActive: conversations.isActive,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(whereClause)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    // Fetch participant info for each conversation
    const enriched = await Promise.all(
      data.map(async (conv) => {
        const otherUserId =
          conv.participantOneId === userId
            ? conv.participantTwoId
            : conv.participantOneId;

        const [otherUser] = await this.db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, otherUserId))
          .limit(1);

        // Count unread messages in this conversation
        const [unreadResult] = await this.db
          .select({ unread: count() })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conv.id),
              eq(messages.isRead, false),
              sql`${messages.senderId} != ${userId}`,
            ),
          );

        return {
          ...conv,
          otherParticipant: otherUser || null,
          unreadCount: unreadResult?.unread ?? 0,
        };
      }),
    );

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    // Validate user is a participant
    await this.validateParticipant(conversationId, userId);

    const offset = (page - 1) * limit;

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        type: messages.type,
        isRead: messages.isRead,
        readAt: messages.readAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: data.reverse(), // Return in chronological order
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: 'text' | 'image' | 'system' = 'text',
  ) {
    // Validate sender is a participant
    await this.validateParticipant(conversationId, senderId);

    const preview =
      content.length > 200 ? content.substring(0, 197) + '...' : content;

    const result = await this.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          conversationId,
          senderId,
          content,
          type,
        })
        .returning();

      await tx
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: preview,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      return message;
    });

    this.logger.log({
      message: 'Message sent',
      messageId: result.id,
      conversationId,
      senderId,
      type,
    });

    return result;
  }

  async markAsRead(conversationId: string, userId: string) {
    // Validate user is a participant
    await this.validateParticipant(conversationId, userId);

    const now = new Date();
    const result = await this.db
      .update(messages)
      .set({ isRead: true, readAt: now })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.isRead, false),
          sql`${messages.senderId} != ${userId}`,
        ),
      )
      .returning({ id: messages.id });

    this.logger.log({
      message: 'Messages marked as read',
      conversationId,
      userId,
      count: result.length,
    });

    return { markedCount: result.length };
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Get all conversations for user
    const userConversations = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          or(
            eq(conversations.participantOneId, userId),
            eq(conversations.participantTwoId, userId),
          ),
          eq(conversations.isActive, true),
        ),
      );

    if (userConversations.length === 0) return 0;

    const conversationIds = userConversations.map((c) => c.id);

    const [result] = await this.db
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          sql`${messages.conversationId} IN (${sql.join(
            conversationIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(messages.isRead, false),
          sql`${messages.senderId} != ${userId}`,
        ),
      );

    return result?.total ?? 0;
  }

  async getConversationById(conversationId: string) {
    const [conv] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv) {
      throw new NotFoundException(
        `Conversation with id ${conversationId} not found`,
      );
    }

    return conv;
  }

  private async validateParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conv = await this.getConversationById(conversationId);

    if (
      conv.participantOneId !== userId &&
      conv.participantTwoId !== userId
    ) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }
  }
}
