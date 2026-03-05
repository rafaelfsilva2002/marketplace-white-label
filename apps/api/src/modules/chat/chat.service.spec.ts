import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFluentChain(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) });
  const values = vi.fn().mockReturnValue({ returning, onConflictDoUpdate: vi.fn().mockReturnValue({ returning }) });
  const limit = vi.fn().mockResolvedValue(rows);
  const offset = vi.fn().mockReturnValue({ then: (r: any) => Promise.resolve(rows).then(r) });
  const orderBy = vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({ offset }),
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const where = vi.fn().mockReturnValue({
    orderBy,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const from = vi.fn().mockReturnValue({
    where,
    orderBy,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });

  return { from, where, orderBy, limit, offset, values, set, returning };
}

const FAKE_CONVERSATION = {
  id: 'conv-uuid-1',
  participantOneId: 'user-aaa',
  participantTwoId: 'user-bbb',
  lastMessageAt: new Date('2026-03-01'),
  lastMessagePreview: 'Hello!',
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

const FAKE_USER = {
  id: 'user-bbb',
  name: 'Bob',
  email: 'bob@example.com',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatService', () => {
  let service: ChatService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockTx: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      insert: vi.fn(),
      update: vi.fn(),
    };

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    };

    service = new ChatService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // getOrCreateConversation
  // -------------------------------------------------------------------------

  describe('getOrCreateConversation', () => {
    it('should return existing conversation when one exists', async () => {
      const chain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: chain.from });

      const result = await service.getOrCreateConversation('user-aaa', 'user-bbb');

      expect(result).toEqual(FAKE_CONVERSATION);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should create a new conversation when none exists', async () => {
      // First select returns empty (no existing conversation)
      const selectChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: selectChain.from });

      // Insert returns the new conversation
      const insertReturning = vi.fn().mockResolvedValue([FAKE_CONVERSATION]);
      const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
      mockDb.insert.mockReturnValue({ values: insertValues });

      const result = await service.getOrCreateConversation('user-aaa', 'user-bbb');

      expect(result).toEqual(FAKE_CONVERSATION);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should order participants so the smaller UUID is participantOne', async () => {
      const selectChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: selectChain.from });

      const insertReturning = vi.fn().mockResolvedValue([FAKE_CONVERSATION]);
      const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
      mockDb.insert.mockReturnValue({ values: insertValues });

      // Pass in reverse order — user-bbb first, user-aaa second
      await service.getOrCreateConversation('user-bbb', 'user-aaa');

      // insert().values() should have been called with the sorted participants
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          participantOneId: 'user-aaa',
          participantTwoId: 'user-bbb',
        }),
      );
    });

    it('should handle same-order UUIDs without swapping', async () => {
      const selectChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: selectChain.from });

      const insertReturning = vi.fn().mockResolvedValue([FAKE_CONVERSATION]);
      const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.getOrCreateConversation('user-aaa', 'user-bbb');

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          participantOneId: 'user-aaa',
          participantTwoId: 'user-bbb',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getConversations
  // -------------------------------------------------------------------------

  describe('getConversations', () => {
    it('should return paginated conversations with enriched data', async () => {
      // 1. count query
      const countChain = createFluentChain([{ total: 1 }]);
      // 2. conversations query
      const convsChain = createFluentChain([FAKE_CONVERSATION]);
      // 3. other user query
      const userChain = createFluentChain([FAKE_USER]);
      // 4. unread count query
      const unreadChain = createFluentChain([{ unread: 3 }]);

      mockDb.select
        .mockReturnValueOnce({ from: countChain.from })
        .mockReturnValueOnce({ from: convsChain.from })
        .mockReturnValueOnce({ from: userChain.from })
        .mockReturnValueOnce({ from: unreadChain.from });

      const result = await service.getConversations('user-aaa', 1, 20);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('otherParticipant');
      expect(result.data[0]).toHaveProperty('unreadCount');
    });

    it('should return empty data when no conversations exist', async () => {
      const countChain = createFluentChain([{ total: 0 }]);
      const convsChain = createFluentChain([]);

      mockDb.select
        .mockReturnValueOnce({ from: countChain.from })
        .mockReturnValueOnce({ from: convsChain.from });

      const result = await service.getConversations('user-new', 1, 20);

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });

    it('should compute totalPages correctly', async () => {
      const countChain = createFluentChain([{ total: 25 }]);
      const convsChain = createFluentChain([]);

      mockDb.select
        .mockReturnValueOnce({ from: countChain.from })
        .mockReturnValueOnce({ from: convsChain.from });

      const result = await service.getConversations('user-aaa', 1, 10);

      expect(result.totalPages).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // getMessages
  // -------------------------------------------------------------------------

  describe('getMessages', () => {
    it('should return paginated messages in chronological order', async () => {
      // validate participant: getConversationById
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      // count
      const countChain = createFluentChain([{ total: 2 }]);
      // messages
      const msg1 = { ...FAKE_MESSAGE, id: 'msg-1', createdAt: new Date('2026-03-01T10:00:00') };
      const msg2 = { ...FAKE_MESSAGE, id: 'msg-2', createdAt: new Date('2026-03-01T11:00:00') };
      const msgsChain = createFluentChain([msg2, msg1]); // desc order from DB

      mockDb.select
        .mockReturnValueOnce({ from: convChain.from })   // validateParticipant
        .mockReturnValueOnce({ from: countChain.from })   // count
        .mockReturnValueOnce({ from: msgsChain.from });   // messages

      const result = await service.getMessages('conv-uuid-1', 'user-aaa', 1, 50);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      // Should be reversed to chronological order
      expect(result.data[0].id).toBe('msg-1');
      expect(result.data[1].id).toBe('msg-2');
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      await expect(
        service.getMessages('conv-uuid-1', 'user-stranger', 1, 50),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      const convChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      await expect(
        service.getMessages('nonexistent', 'user-aaa', 1, 50),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('should insert message and update conversation in a transaction', async () => {
      // validateParticipant
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      mockDb.transaction.mockImplementation(async (cb: any) => {
        const txInsertReturning = vi.fn().mockResolvedValue([FAKE_MESSAGE]);
        const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
        const txUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
        const tx = {
          insert: vi.fn().mockReturnValue({ values: txInsertValues }),
          update: vi.fn().mockReturnValue({ set: txUpdateSet }),
        };
        return cb(tx);
      });

      const result = await service.sendMessage('conv-uuid-1', 'user-aaa', 'Hello!', 'text');

      expect(result).toEqual(FAKE_MESSAGE);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should truncate preview to 200 characters for long messages', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      let capturedSet: any;
      mockDb.transaction.mockImplementation(async (cb: any) => {
        const txInsertReturning = vi.fn().mockResolvedValue([FAKE_MESSAGE]);
        const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
        const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
        const txUpdateSet = vi.fn().mockImplementation((val) => {
          capturedSet = val;
          return { where: txUpdateWhere };
        });
        const tx = {
          insert: vi.fn().mockReturnValue({ values: txInsertValues }),
          update: vi.fn().mockReturnValue({ set: txUpdateSet }),
        };
        return cb(tx);
      });

      const longContent = 'A'.repeat(300);
      await service.sendMessage('conv-uuid-1', 'user-aaa', longContent, 'text');

      expect(capturedSet.lastMessagePreview).toHaveLength(200);
      expect(capturedSet.lastMessagePreview).toMatch(/\.\.\.$/);
    });

    it('should throw ForbiddenException when sender is not a participant', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      await expect(
        service.sendMessage('conv-uuid-1', 'user-stranger', 'Hello!'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use default type of text when not specified', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      let capturedValues: any;
      mockDb.transaction.mockImplementation(async (cb: any) => {
        const txInsertReturning = vi.fn().mockResolvedValue([FAKE_MESSAGE]);
        const txInsertValues = vi.fn().mockImplementation((val) => {
          capturedValues = val;
          return { returning: txInsertReturning };
        });
        const txUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
        const tx = {
          insert: vi.fn().mockReturnValue({ values: txInsertValues }),
          update: vi.fn().mockReturnValue({ set: txUpdateSet }),
        };
        return cb(tx);
      });

      await service.sendMessage('conv-uuid-1', 'user-aaa', 'Hello!');

      expect(capturedValues.type).toBe('text');
    });
  });

  // -------------------------------------------------------------------------
  // markAsRead
  // -------------------------------------------------------------------------

  describe('markAsRead', () => {
    it('should mark unread messages as read and return count', async () => {
      // validateParticipant
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      const returning = vi.fn().mockResolvedValue([{ id: 'msg-1' }, { id: 'msg-2' }]);
      const where = vi.fn().mockReturnValue({ returning });
      const set = vi.fn().mockReturnValue({ where });
      mockDb.update.mockReturnValue({ set });

      const result = await service.markAsRead('conv-uuid-1', 'user-bbb');

      expect(result).toEqual({ markedCount: 2 });
    });

    it('should return markedCount of 0 when no unread messages', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      const returning = vi.fn().mockResolvedValue([]);
      const where = vi.fn().mockReturnValue({ returning });
      const set = vi.fn().mockReturnValue({ where });
      mockDb.update.mockReturnValue({ set });

      const result = await service.markAsRead('conv-uuid-1', 'user-aaa');

      expect(result).toEqual({ markedCount: 0 });
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      await expect(
        service.markAsRead('conv-uuid-1', 'user-stranger'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // getUnreadCount
  // -------------------------------------------------------------------------

  describe('getUnreadCount', () => {
    it('should return total unread count across all conversations', async () => {
      // user conversations
      const convsChain = createFluentChain([{ id: 'conv-1' }, { id: 'conv-2' }]);
      // unread count
      const unreadChain = createFluentChain([{ total: 5 }]);

      mockDb.select
        .mockReturnValueOnce({ from: convsChain.from })
        .mockReturnValueOnce({ from: unreadChain.from });

      const result = await service.getUnreadCount('user-aaa');

      expect(result).toBe(5);
    });

    it('should return 0 when user has no conversations', async () => {
      const convsChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: convsChain.from });

      const result = await service.getUnreadCount('user-new');

      expect(result).toBe(0);
    });

    it('should return 0 when there are no unread messages', async () => {
      const convsChain = createFluentChain([{ id: 'conv-1' }]);
      const unreadChain = createFluentChain([{ total: 0 }]);

      mockDb.select
        .mockReturnValueOnce({ from: convsChain.from })
        .mockReturnValueOnce({ from: unreadChain.from });

      const result = await service.getUnreadCount('user-aaa');

      expect(result).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getConversationById
  // -------------------------------------------------------------------------

  describe('getConversationById', () => {
    it('should return the conversation when found', async () => {
      const convChain = createFluentChain([FAKE_CONVERSATION]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      const result = await service.getConversationById('conv-uuid-1');

      expect(result).toEqual(FAKE_CONVERSATION);
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      const convChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      await expect(
        service.getConversationById('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include the conversation id in the error message', async () => {
      const convChain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: convChain.from });

      await expect(
        service.getConversationById('missing-id'),
      ).rejects.toThrow('Conversation with id missing-id not found');
    });
  });
});
