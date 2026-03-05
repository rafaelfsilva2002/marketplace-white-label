import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatController } from './chat.controller';
import type { JwtUser } from '@/modules/auth/strategies/jwt.strategy';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_JWT_USER: JwtUser = {
  id: 'user-uuid-1',
  email: 'jane@example.com',
  role: 'user',
};

const FAKE_CONVERSATION = {
  id: 'conv-uuid-1',
  participantOneId: 'user-uuid-1',
  participantTwoId: 'user-uuid-2',
  lastMessageAt: new Date('2026-03-01'),
  lastMessagePreview: 'Hello!',
  isActive: true,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
};

const FAKE_PAGINATED_CONVERSATIONS = {
  data: [FAKE_CONVERSATION],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const FAKE_MESSAGE = {
  id: 'msg-uuid-1',
  conversationId: 'conv-uuid-1',
  senderId: 'user-uuid-1',
  content: 'Hello!',
  type: 'text',
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-03-01'),
};

const FAKE_PAGINATED_MESSAGES = {
  data: [FAKE_MESSAGE],
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatController', () => {
  let controller: ChatController;
  let mockChatService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChatService = {
      getConversations: vi.fn(),
      getMessages: vi.fn(),
      getOrCreateConversation: vi.fn(),
      sendMessage: vi.fn(),
      markAsRead: vi.fn(),
      getUnreadCount: vi.fn(),
    };

    controller = new ChatController(mockChatService as any);
  });

  // -------------------------------------------------------------------------
  // GET /chat/conversations
  // -------------------------------------------------------------------------

  describe('GET /chat/conversations', () => {
    it('should call chatService.getConversations with default pagination', async () => {
      mockChatService.getConversations.mockResolvedValue(FAKE_PAGINATED_CONVERSATIONS);

      const result = await controller.getConversations(FAKE_JWT_USER);

      expect(mockChatService.getConversations).toHaveBeenCalledWith(
        'user-uuid-1',
        1,
        20,
      );
      expect(result).toEqual({ success: true, data: FAKE_PAGINATED_CONVERSATIONS });
    });

    it('should parse custom page and limit from query strings', async () => {
      mockChatService.getConversations.mockResolvedValue(FAKE_PAGINATED_CONVERSATIONS);

      await controller.getConversations(FAKE_JWT_USER, '3', '10');

      expect(mockChatService.getConversations).toHaveBeenCalledWith(
        'user-uuid-1',
        3,
        10,
      );
    });

    it('should clamp limit to max of 50', async () => {
      mockChatService.getConversations.mockResolvedValue(FAKE_PAGINATED_CONVERSATIONS);

      await controller.getConversations(FAKE_JWT_USER, '1', '100');

      expect(mockChatService.getConversations).toHaveBeenCalledWith(
        'user-uuid-1',
        1,
        50,
      );
    });

    it('should default to page 1 when invalid page is provided', async () => {
      mockChatService.getConversations.mockResolvedValue(FAKE_PAGINATED_CONVERSATIONS);

      await controller.getConversations(FAKE_JWT_USER, 'abc');

      expect(mockChatService.getConversations).toHaveBeenCalledWith(
        'user-uuid-1',
        1,
        20,
      );
    });

    it('should propagate errors from chatService.getConversations', async () => {
      mockChatService.getConversations.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.getConversations(FAKE_JWT_USER),
      ).rejects.toThrow('DB error');
    });
  });

  // -------------------------------------------------------------------------
  // GET /chat/conversations/:id/messages
  // -------------------------------------------------------------------------

  describe('GET /chat/conversations/:id/messages', () => {
    it('should call chatService.getMessages with default pagination', async () => {
      mockChatService.getMessages.mockResolvedValue(FAKE_PAGINATED_MESSAGES);

      const result = await controller.getMessages(FAKE_JWT_USER, 'conv-uuid-1');

      expect(mockChatService.getMessages).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-uuid-1',
        1,
        50,
      );
      expect(result).toEqual({ success: true, data: FAKE_PAGINATED_MESSAGES });
    });

    it('should parse custom page and limit', async () => {
      mockChatService.getMessages.mockResolvedValue(FAKE_PAGINATED_MESSAGES);

      await controller.getMessages(FAKE_JWT_USER, 'conv-uuid-1', '2', '25');

      expect(mockChatService.getMessages).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-uuid-1',
        2,
        25,
      );
    });

    it('should clamp limit to max of 100', async () => {
      mockChatService.getMessages.mockResolvedValue(FAKE_PAGINATED_MESSAGES);

      await controller.getMessages(FAKE_JWT_USER, 'conv-uuid-1', '1', '500');

      expect(mockChatService.getMessages).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-uuid-1',
        1,
        100,
      );
    });

    it('should propagate errors from chatService.getMessages', async () => {
      mockChatService.getMessages.mockRejectedValue(new Error('Not found'));

      await expect(
        controller.getMessages(FAKE_JWT_USER, 'conv-uuid-1'),
      ).rejects.toThrow('Not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST /chat/conversations
  // -------------------------------------------------------------------------

  describe('POST /chat/conversations', () => {
    it('should call chatService.getOrCreateConversation and return the conversation', async () => {
      mockChatService.getOrCreateConversation.mockResolvedValue(FAKE_CONVERSATION);

      const dto = { participantId: 'user-uuid-2' };
      const result = await controller.createConversation(FAKE_JWT_USER, dto);

      expect(mockChatService.getOrCreateConversation).toHaveBeenCalledWith(
        'user-uuid-1',
        'user-uuid-2',
      );
      expect(result).toEqual({ success: true, data: FAKE_CONVERSATION });
    });

    it('should propagate errors from chatService.getOrCreateConversation', async () => {
      mockChatService.getOrCreateConversation.mockRejectedValue(
        new Error('Conflict'),
      );

      const dto = { participantId: 'user-uuid-2' };
      await expect(
        controller.createConversation(FAKE_JWT_USER, dto),
      ).rejects.toThrow('Conflict');
    });
  });

  // -------------------------------------------------------------------------
  // POST /chat/conversations/:id/messages
  // -------------------------------------------------------------------------

  describe('POST /chat/conversations/:id/messages', () => {
    it('should call chatService.sendMessage and return the message', async () => {
      mockChatService.sendMessage.mockResolvedValue(FAKE_MESSAGE);

      const dto = { content: 'Hello!', type: 'text' as const };
      const result = await controller.sendMessage(FAKE_JWT_USER, 'conv-uuid-1', dto);

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-uuid-1',
        'Hello!',
        'text',
      );
      expect(result).toEqual({ success: true, data: FAKE_MESSAGE });
    });

    it('should pass undefined type when not specified in dto', async () => {
      mockChatService.sendMessage.mockResolvedValue(FAKE_MESSAGE);

      const dto = { content: 'Hello!' };
      await controller.sendMessage(FAKE_JWT_USER, 'conv-uuid-1', dto as any);

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-uuid-1',
        'Hello!',
        undefined,
      );
    });

    it('should propagate ForbiddenException from chatService.sendMessage', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockChatService.sendMessage.mockRejectedValue(
        new ForbiddenException('Not a participant'),
      );

      const dto = { content: 'Hello!', type: 'text' as const };
      await expect(
        controller.sendMessage(FAKE_JWT_USER, 'conv-uuid-1', dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // POST /chat/conversations/:id/read
  // -------------------------------------------------------------------------

  describe('POST /chat/conversations/:id/read', () => {
    it('should call chatService.markAsRead and return the result', async () => {
      mockChatService.markAsRead.mockResolvedValue({ markedCount: 5 });

      const result = await controller.markAsRead(FAKE_JWT_USER, 'conv-uuid-1');

      expect(mockChatService.markAsRead).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-uuid-1',
      );
      expect(result).toEqual({ success: true, data: { markedCount: 5 } });
    });

    it('should propagate errors from chatService.markAsRead', async () => {
      mockChatService.markAsRead.mockRejectedValue(new Error('Failed'));

      await expect(
        controller.markAsRead(FAKE_JWT_USER, 'conv-uuid-1'),
      ).rejects.toThrow('Failed');
    });
  });

  // -------------------------------------------------------------------------
  // GET /chat/unread-count
  // -------------------------------------------------------------------------

  describe('GET /chat/unread-count', () => {
    it('should return the unread count wrapped in success response', async () => {
      mockChatService.getUnreadCount.mockResolvedValue(7);

      const result = await controller.getUnreadCount(FAKE_JWT_USER);

      expect(mockChatService.getUnreadCount).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual({ success: true, data: { unreadCount: 7 } });
    });

    it('should return 0 unread count when no messages', async () => {
      mockChatService.getUnreadCount.mockResolvedValue(0);

      const result = await controller.getUnreadCount(FAKE_JWT_USER);

      expect(result).toEqual({ success: true, data: { unreadCount: 0 } });
    });

    it('should propagate errors from chatService.getUnreadCount', async () => {
      mockChatService.getUnreadCount.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.getUnreadCount(FAKE_JWT_USER),
      ).rejects.toThrow('DB error');
    });
  });
});
