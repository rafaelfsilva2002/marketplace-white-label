import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushNotificationService } from './push-notification.service';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFluentChain(rows: unknown[]) {
  const where = vi.fn().mockReturnValue({
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const from = vi.fn().mockReturnValue({
    where,
    then: (r: any) => Promise.resolve(rows).then(r),
  });

  return { from, where };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    service = new PushNotificationService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // registerToken
  // -------------------------------------------------------------------------

  describe('registerToken', () => {
    it('should insert a new push token with upsert', async () => {
      const onConflict = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflict });
      mockDb.insert.mockReturnValue({ values });

      await service.registerToken('user-1', 'ExponentPushToken[abc123]', 'ios');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          token: 'ExponentPushToken[abc123]',
          platform: 'ios',
          isActive: true,
        }),
      );
    });

    it('should handle android platform', async () => {
      const onConflict = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflict });
      mockDb.insert.mockReturnValue({ values });

      await service.registerToken('user-2', 'ExponentPushToken[def456]', 'android');

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'android',
        }),
      );
    });

    it('should handle web platform', async () => {
      const onConflict = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflict });
      mockDb.insert.mockReturnValue({ values });

      await service.registerToken('user-3', 'web-push-token-xyz', 'web');

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'web',
        }),
      );
    });

    it('should call onConflictDoUpdate for existing tokens', async () => {
      const onConflict = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflict });
      mockDb.insert.mockReturnValue({ values });

      await service.registerToken('user-1', 'ExponentPushToken[abc123]', 'ios');

      expect(onConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            userId: 'user-1',
            platform: 'ios',
            isActive: true,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // removeToken
  // -------------------------------------------------------------------------

  describe('removeToken', () => {
    it('should deactivate the token', async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDb.update.mockReturnValue({ set });

      await service.removeToken('ExponentPushToken[abc123]');

      expect(mockDb.update).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
        }),
      );
    });

    it('should not throw when token does not exist', async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDb.update.mockReturnValue({ set });

      await expect(
        service.removeToken('nonexistent-token'),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // sendPushNotification
  // -------------------------------------------------------------------------

  describe('sendPushNotification', () => {
    it('should send push notification to all active tokens for the user', async () => {
      const tokens = [
        { token: 'ExponentPushToken[token1]' },
        { token: 'ExponentPushToken[token2]' },
      ];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ status: 'ok', id: 'ticket-1' }, { status: 'ok', id: 'ticket-2' }],
        }),
      });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toHaveLength(2);
      expect(body[0].to).toBe('ExponentPushToken[token1]');
      expect(body[0].title).toBe('Title');
      expect(body[0].body).toBe('Body');
    });

    it('should not call fetch when no active tokens exist', async () => {
      const chain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: chain.from });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should include data payload when provided', async () => {
      const tokens = [{ token: 'ExponentPushToken[token1]' }];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ status: 'ok', id: 'ticket-1' }],
        }),
      });

      await service.sendPushNotification('user-1', 'Title', 'Body', {
        screen: 'chat',
        conversationId: 'conv-1',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body[0].data).toEqual({
        screen: 'chat',
        conversationId: 'conv-1',
      });
    });

    it('should handle Expo API error response gracefully', async () => {
      const tokens = [{ token: 'ExponentPushToken[token1]' }];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      });

      // Should not throw
      await expect(
        service.sendPushNotification('user-1', 'Title', 'Body'),
      ).resolves.toBeUndefined();
    });

    it('should deactivate tokens that receive DeviceNotRegistered error', async () => {
      const tokens = [{ token: 'ExponentPushToken[invalid]' }];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{
            status: 'error',
            message: 'Device not registered',
            details: { error: 'DeviceNotRegistered' },
          }],
        }),
      });

      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDb.update.mockReturnValue({ set });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle fetch network failure gracefully', async () => {
      const tokens = [{ token: 'ExponentPushToken[token1]' }];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(
        service.sendPushNotification('user-1', 'Title', 'Body'),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // sendBulkPush
  // -------------------------------------------------------------------------

  describe('sendBulkPush', () => {
    it('should send push notifications to multiple users', async () => {
      const tokens = [
        { token: 'ExponentPushToken[token1]' },
        { token: 'ExponentPushToken[token2]' },
      ];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ status: 'ok' }, { status: 'ok' }],
        }),
      });

      await service.sendBulkPush(['user-1', 'user-2'], 'Bulk Title', 'Bulk Body');

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toHaveLength(2);
    });

    it('should return early when userIds array is empty', async () => {
      await service.sendBulkPush([], 'Title', 'Body');

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not call fetch when no active tokens for the users', async () => {
      const chain = createFluentChain([]);
      mockDb.select.mockReturnValue({ from: chain.from });

      await service.sendBulkPush(['user-1', 'user-2'], 'Title', 'Body');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should include data payload in bulk push messages', async () => {
      const tokens = [{ token: 'ExponentPushToken[token1]' }];
      const chain = createFluentChain(tokens);
      mockDb.select.mockReturnValue({ from: chain.from });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ status: 'ok' }],
        }),
      });

      await service.sendBulkPush(
        ['user-1'],
        'Promo',
        'Check out our new feature!',
        { type: 'promo', url: '/promo' },
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body[0].data).toEqual({ type: 'promo', url: '/promo' });
    });
  });
});
