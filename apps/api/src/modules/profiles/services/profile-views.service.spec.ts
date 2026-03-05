import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ProfileViewsService } from './profile-views.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/common/interceptors/correlation-id.interceptor', () => ({
  getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
  correlationStorage: new AsyncLocalStorage(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainedSelect(rows: unknown[]) {
  const where = vi.fn().mockReturnValue({
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const from = vi.fn().mockReturnValue({
    where,
    then: (r: any) => Promise.resolve(rows).then(r),
  });

  return { from, where };
}

function chainedInsert() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function chainedUpdate() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

const FAKE_VIEW_INPUT = {
  profileId: 'profile-1',
  viewerId: 'viewer-1',
  sessionId: 'session-abc',
  duration: 30,
  source: 'search',
  referrer: 'https://google.com',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileViewsService', () => {
  let service: ProfileViewsService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    service = new ProfileViewsService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // recordView
  // -------------------------------------------------------------------------

  describe('recordView', () => {
    it('should insert a profile view record', async () => {
      const insertMock = chainedInsert();
      mockDb.insert
        .mockReturnValueOnce(insertMock)   // insert profileViews
        .mockReturnValue(chainedInsert()); // fallback

      mockDb.update.mockReturnValue(chainedUpdate());

      await service.recordView(FAKE_VIEW_INPUT);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-1',
          viewerId: 'viewer-1',
          sessionId: 'session-abc',
          duration: 30,
          source: 'search',
          referrer: 'https://google.com',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });

    it('should increment the profile viewsCount', async () => {
      mockDb.insert.mockReturnValue(chainedInsert());
      mockDb.update.mockReturnValue(chainedUpdate());

      await service.recordView(FAKE_VIEW_INPUT);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle anonymous view (no viewerId)', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);
      mockDb.update.mockReturnValue(chainedUpdate());

      await service.recordView({
        profileId: 'profile-1',
        sessionId: 'session-xyz',
      });

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-1',
          viewerId: undefined,
          sessionId: 'session-xyz',
        }),
      );
    });

    it('should handle view with minimal data (only profileId)', async () => {
      mockDb.insert.mockReturnValue(chainedInsert());
      mockDb.update.mockReturnValue(chainedUpdate());

      await expect(
        service.recordView({ profileId: 'profile-1' }),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getViewStats
  // -------------------------------------------------------------------------

  describe('getViewStats', () => {
    it('should return all view statistics', async () => {
      const totalChain = chainedSelect([{ total: 100 }]);
      const uniqueChain = chainedSelect([{ unique: 80 }]);
      const last24hChain = chainedSelect([{ total: 10 }]);
      const last7dChain = chainedSelect([{ total: 40 }]);
      const last30dChain = chainedSelect([{ total: 90 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: totalChain.from };
        if (callCount === 2) return { from: uniqueChain.from };
        if (callCount === 3) return { from: last24hChain.from };
        if (callCount === 4) return { from: last7dChain.from };
        return { from: last30dChain.from };
      });

      const result = await service.getViewStats('profile-1');

      expect(result.totalViews).toBe(100);
      expect(result.uniqueViewers).toBe(80);
      expect(result.viewsLast24h).toBe(10);
      expect(result.viewsLast7d).toBe(40);
      expect(result.viewsLast30d).toBe(90);
    });

    it('should return zeros when no views exist', async () => {
      const zeroChain = chainedSelect([{ total: 0 }]);
      const uniqueZeroChain = chainedSelect([{ unique: 0 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 2) return { from: uniqueZeroChain.from };
        return { from: zeroChain.from };
      });

      const result = await service.getViewStats('profile-new');

      expect(result.totalViews).toBe(0);
      expect(result.uniqueViewers).toBe(0);
      expect(result.viewsLast24h).toBe(0);
      expect(result.viewsLast7d).toBe(0);
      expect(result.viewsLast30d).toBe(0);
    });

    it('should default totalViews to 0 when result is undefined', async () => {
      const undefinedChain = chainedSelect([undefined]);
      const uniqueChain = chainedSelect([undefined]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 2) return { from: uniqueChain.from };
        return { from: undefinedChain.from };
      });

      const result = await service.getViewStats('profile-1');

      expect(result.totalViews).toBe(0);
      expect(result.uniqueViewers).toBe(0);
    });

    it('should make 5 database queries for different time ranges', async () => {
      const chain = chainedSelect([{ total: 5, unique: 3 }]);
      mockDb.select.mockReturnValue({ from: chain.from });

      await service.getViewStats('profile-1');

      expect(mockDb.select).toHaveBeenCalledTimes(5);
    });

    it('should convert unique viewers to number', async () => {
      const totalChain = chainedSelect([{ total: 50 }]);
      const uniqueChain = chainedSelect([{ unique: '25' }]); // string from SQL
      const otherChain = chainedSelect([{ total: 10 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: totalChain.from };
        if (callCount === 2) return { from: uniqueChain.from };
        return { from: otherChain.from };
      });

      const result = await service.getViewStats('profile-1');

      expect(result.uniqueViewers).toBe(25);
      expect(typeof result.uniqueViewers).toBe('number');
    });
  });
});
