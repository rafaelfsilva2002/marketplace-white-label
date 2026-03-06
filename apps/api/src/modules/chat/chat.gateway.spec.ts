import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatGateway } from './chat.gateway';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CONVERSATION = {
  id: 'conv-uuid-1',
  participantOneId: 'user-aaa',
  participantTwoId: 'user-bbb',
  isActive: true,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
};

const FAKE_MESSAGE = {
  id: 'msg-uuid-1',
  conversationId: 'conv-uuid-1',
  senderId: 'user-aaa',
  content: 'Hello!',
  type: 'text',
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-03-01'),
};

function createMockSocket(overrides: Record<string, unknown> = {}): any {
  const userId = (overrides as any).userId;
  const token = userId ? `valid-token-for-${userId}` : undefined;

  return {
    id: overrides.id ?? 'socket-1',
    handshake: {
      auth: { token: (overrides as any).authToken ?? token },
      headers: overrides.headers ?? {},
    },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    emit: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    disconnect: vi.fn(),
  };
}

function createMockServer(): any {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
    _emitFn: emitFn,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let mockChatService: Record<string, ReturnType<typeof vi.fn>>;
  let mockTokenService: Record<string, ReturnType<typeof vi.fn>>;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChatService = {
      getConversationById: vi.fn(),
      sendMessage: vi.fn(),
      markAsRead: vi.fn(),
    };

    mockTokenService = {
      verifyAccessToken: vi.fn().mockImplementation((token: string) => {
        // Tokens created by createMockSocket follow the pattern "valid-token-for-<userId>"
        const match = token.match(/^valid-token-for-(.+)$/);
        if (match) {
          return Promise.resolve({ sub: match[1], email: 'test@example.com', role: 'user' });
        }
        return Promise.reject(new Error('Invalid or expired access token'));
      }),
    };

    gateway = new ChatGateway(mockChatService as any, mockTokenService as any);
    mockServer = createMockServer();
    gateway.server = mockServer;
  });

  // -------------------------------------------------------------------------
  // handleConnection
  // -------------------------------------------------------------------------

  describe('handleConnection', () => {
    it('should register the socket and join user room when token is valid', async () => {
      const client = createMockSocket({ userId: 'user-aaa' });

      await gateway.handleConnection(client);

      expect(client.data.userId).toBe('user-aaa');
      expect(client.join).toHaveBeenCalledWith('user:user-aaa');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client when no token is provided', async () => {
      const client = createMockSocket({ authToken: undefined });
      client.handshake.auth = {};
      client.handshake.headers = {};

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client when token is invalid', async () => {
      const client = createMockSocket({ authToken: 'not-a-jwt' });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should support token from authorization header', async () => {
      const token = 'valid-token-for-user-from-header';
      const client = createMockSocket({ authToken: undefined });
      client.handshake.auth = {};
      client.handshake.headers = { authorization: `Bearer ${token}` };

      await gateway.handleConnection(client);

      expect(client.data.userId).toBe('user-from-header');
      expect(client.join).toHaveBeenCalledWith('user:user-from-header');
    });

    it('should allow multiple sockets for the same user', async () => {
      const client1 = createMockSocket({ id: 'socket-1', userId: 'user-aaa' });
      const client2 = createMockSocket({ id: 'socket-2', userId: 'user-aaa' });

      await gateway.handleConnection(client1);
      await gateway.handleConnection(client2);

      expect(client1.join).toHaveBeenCalledWith('user:user-aaa');
      expect(client2.join).toHaveBeenCalledWith('user:user-aaa');
    });
  });

  // -------------------------------------------------------------------------
  // handleDisconnect
  // -------------------------------------------------------------------------

  describe('handleDisconnect', () => {
    it('should remove the socket from tracking', async () => {
      const client = createMockSocket({ id: 'socket-1', userId: 'user-aaa' });
      await gateway.handleConnection(client);

      gateway.handleDisconnect(client);

      // Should not throw on second disconnect
      gateway.handleDisconnect(client);
    });

    it('should handle disconnect for client with no userId gracefully', () => {
      const client = createMockSocket({});
      client.data = {};

      // Should not throw
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // handleJoinConversation (join_conversation)
  // -------------------------------------------------------------------------

  describe('handleJoinConversation', () => {
    it('should join the conversation room when user is a participant', async () => {
      const client = createMockSocket({ userId: 'user-aaa' });
      await gateway.handleConnection(client);

      mockChatService.getConversationById.mockResolvedValue(FAKE_CONVERSATION);

      await gateway.handleJoinConversation(client, { conversationId: 'conv-uuid-1' });

      expect(client.join).toHaveBeenCalledWith('conversation:conv-uuid-1');
      expect(client.emit).toHaveBeenCalledWith('joined_conversation', {
        conversationId: 'conv-uuid-1',
      });
    });

    it('should emit error when user is not a participant', async () => {
      const client = createMockSocket({ userId: 'user-stranger' });
      await gateway.handleConnection(client);

      mockChatService.getConversationById.mockResolvedValue(FAKE_CONVERSATION);

      await gateway.handleJoinConversation(client, { conversationId: 'conv-uuid-1' });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Not a participant of this conversation',
      });
    });

    it('should emit error when conversation is not found', async () => {
      const client = createMockSocket({ userId: 'user-aaa' });
      await gateway.handleConnection(client);

      mockChatService.getConversationById.mockRejectedValue(
        new Error('Not found'),
      );

      await gateway.handleJoinConversation(client, { conversationId: 'nonexistent' });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to join conversation',
      });
    });

    it('should do nothing when client has no userId', async () => {
      const client = createMockSocket({});
      client.data = {};

      await gateway.handleJoinConversation(client, { conversationId: 'conv-uuid-1' });

      expect(mockChatService.getConversationById).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleSendMessage (send_message)
  // -------------------------------------------------------------------------

  describe('handleSendMessage', () => {
    it('should send message and emit to conversation room', async () => {
      const client = createMockSocket({ userId: 'user-aaa' });
      await gateway.handleConnection(client);

      mockChatService.sendMessage.mockResolvedValue(FAKE_MESSAGE);
      mockChatService.getConversationById.mockResolvedValue(FAKE_CONVERSATION);

      await gateway.handleSendMessage(client, {
        conversationId: 'conv-uuid-1',
        content: 'Hello!',
      });

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-aaa',
        'Hello!',
        'text',
      );
      expect(mockServer.to).toHaveBeenCalledWith('conversation:conv-uuid-1');
      expect(mockServer.to).toHaveBeenCalledWith('user:user-bbb');
    });

    it('should use specified message type', async () => {
      const client = createMockSocket({ userId: 'user-aaa' });
      await gateway.handleConnection(client);

      mockChatService.sendMessage.mockResolvedValue(FAKE_MESSAGE);
      mockChatService.getConversationById.mockResolvedValue(FAKE_CONVERSATION);

      await gateway.handleSendMessage(client, {
        conversationId: 'conv-uuid-1',
        content: 'photo.jpg',
        type: 'image',
      });

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-aaa',
        'photo.jpg',
        'image',
      );
    });

    it('should emit error when sendMessage fails', async () => {
      const client = createMockSocket({ userId: 'user-aaa' });
      await gateway.handleConnection(client);

      mockChatService.sendMessage.mockRejectedValue(
        new Error('Not a participant'),
      );

      await gateway.handleSendMessage(client, {
        conversationId: 'conv-uuid-1',
        content: 'Hello!',
      });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Not a participant',
      });
    });

    it('should do nothing when client has no userId', async () => {
      const client = createMockSocket({});
      client.data = {};

      await gateway.handleSendMessage(client, {
        conversationId: 'conv-uuid-1',
        content: 'Hello!',
      });

      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleTyping (typing)
  // -------------------------------------------------------------------------

  describe('handleTyping', () => {
    it('should broadcast typing status to conversation room excluding sender', async () => {
      const toEmit = vi.fn();
      const client = createMockSocket({ userId: 'user-aaa' });
      client.to = vi.fn().mockReturnValue({ emit: toEmit });
      await gateway.handleConnection(client);

      await gateway.handleTyping(client, {
        conversationId: 'conv-uuid-1',
        isTyping: true,
      });

      expect(client.to).toHaveBeenCalledWith('conversation:conv-uuid-1');
      expect(toEmit).toHaveBeenCalledWith('user_typing', {
        conversationId: 'conv-uuid-1',
        userId: 'user-aaa',
        isTyping: true,
      });
    });

    it('should broadcast isTyping false', async () => {
      const toEmit = vi.fn();
      const client = createMockSocket({ userId: 'user-aaa' });
      client.to = vi.fn().mockReturnValue({ emit: toEmit });
      await gateway.handleConnection(client);

      await gateway.handleTyping(client, {
        conversationId: 'conv-uuid-1',
        isTyping: false,
      });

      expect(toEmit).toHaveBeenCalledWith('user_typing', {
        conversationId: 'conv-uuid-1',
        userId: 'user-aaa',
        isTyping: false,
      });
    });

    it('should do nothing when client has no userId', async () => {
      const client = createMockSocket({});
      client.data = {};

      await gateway.handleTyping(client, {
        conversationId: 'conv-uuid-1',
        isTyping: true,
      });

      expect(client.to).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleMarkRead (mark_read)
  // -------------------------------------------------------------------------

  describe('handleMarkRead', () => {
    it('should mark messages as read and emit to conversation room', async () => {
      const client = createMockSocket({ userId: 'user-bbb' });
      await gateway.handleConnection(client);

      mockChatService.markAsRead.mockResolvedValue({ markedCount: 3 });

      await gateway.handleMarkRead(client, { conversationId: 'conv-uuid-1' });

      expect(mockChatService.markAsRead).toHaveBeenCalledWith(
        'conv-uuid-1',
        'user-bbb',
      );
      expect(mockServer.to).toHaveBeenCalledWith('conversation:conv-uuid-1');
    });

    it('should emit error when markAsRead fails', async () => {
      const client = createMockSocket({ userId: 'user-bbb' });
      await gateway.handleConnection(client);

      mockChatService.markAsRead.mockRejectedValue(new Error('Failed'));

      await gateway.handleMarkRead(client, { conversationId: 'conv-uuid-1' });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to mark messages as read',
      });
    });

    it('should do nothing when client has no userId', async () => {
      const client = createMockSocket({});
      client.data = {};

      await gateway.handleMarkRead(client, { conversationId: 'conv-uuid-1' });

      expect(mockChatService.markAsRead).not.toHaveBeenCalled();
    });
  });
});
