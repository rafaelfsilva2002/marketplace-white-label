import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AnalyticsService } from './analytics.service';

// ---------------------------------------------------------------------------
// Mock correlation-id interceptor
// ---------------------------------------------------------------------------

vi.mock('@/common/interceptors/correlation-id.interceptor', () => ({
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
  correlationStorage: new AsyncLocalStorage(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFluentSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const groupBy = vi.fn().mockReturnValue({
    orderBy,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const where = vi.fn().mockReturnValue({
    groupBy,
    orderBy,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const leftJoin = vi.fn().mockReturnValue({
    where,
    groupBy,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const from = vi.fn().mockReturnValue({
    where,
    leftJoin,
    groupBy,
    orderBy,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });

  return { from, where, groupBy, orderBy, limit, leftJoin };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
    };

    service = new AnalyticsService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // getRevenueAnalytics
  // -------------------------------------------------------------------------

  describe('getRevenueAnalytics', () => {
    it('should return revenue analytics for a given period', async () => {
      // 1. Daily revenue rows
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: '5000' },
        { date: '2026-03-02', value: '3000' },
      ]);
      // 2. Previous period revenue
      const prevChain = createFluentSelect([{ value: '6000' }]);
      // 3. Transaction count
      const txCountChain = createFluentSelect([{ value: 15 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: prevChain.from })
        .mockReturnValueOnce({ from: txCountChain.from });

      const result = await service.getRevenueAnalytics('7d');

      expect(result.period).toBe('7d');
      expect(result.totalRevenue).toBe(8000);
      expect(result.dailyRevenue).toHaveLength(2);
      expect(result.transactionCount).toBe(15);
      expect(result.averageDailyRevenue).toBeGreaterThan(0);
      expect(typeof result.growthPercent).toBe('number');
    });

    it('should handle zero revenue in previous period', async () => {
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: '1000' },
      ]);
      const prevChain = createFluentSelect([{ value: null }]);
      const txCountChain = createFluentSelect([{ value: 5 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: prevChain.from })
        .mockReturnValueOnce({ from: txCountChain.from });

      const result = await service.getRevenueAnalytics('30d');

      expect(result.period).toBe('30d');
      expect(result.growthPercent).toBe(100);
    });

    it('should handle empty revenue data', async () => {
      const dailyChain = createFluentSelect([]);
      const prevChain = createFluentSelect([{ value: null }]);
      const txCountChain = createFluentSelect([{ value: 0 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: prevChain.from })
        .mockReturnValueOnce({ from: txCountChain.from });

      const result = await service.getRevenueAnalytics('7d');

      expect(result.totalRevenue).toBe(0);
      expect(result.dailyRevenue).toHaveLength(0);
      expect(result.growthPercent).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getUserGrowth
  // -------------------------------------------------------------------------

  describe('getUserGrowth', () => {
    it('should return user growth analytics', async () => {
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: 10 },
        { date: '2026-03-02', value: 15 },
      ]);
      const prevChain = createFluentSelect([{ value: 20 }]);
      const totalChain = createFluentSelect([{ value: 500 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: prevChain.from })
        .mockReturnValueOnce({ from: totalChain.from });

      const result = await service.getUserGrowth('7d');

      expect(result.period).toBe('7d');
      expect(result.totalNewUsers).toBe(25);
      expect(result.dailyNewUsers).toHaveLength(2);
      expect(result.totalUsers).toBe(500);
      expect(typeof result.growthPercent).toBe('number');
    });

    it('should calculate positive growth when new users exceed previous period', async () => {
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: 30 },
      ]);
      const prevChain = createFluentSelect([{ value: 10 }]);
      const totalChain = createFluentSelect([{ value: 100 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: prevChain.from })
        .mockReturnValueOnce({ from: totalChain.from });

      const result = await service.getUserGrowth('30d');

      expect(result.growthPercent).toBe(200);
    });

    it('should handle zero previous users', async () => {
      const dailyChain = createFluentSelect([{ date: '2026-03-01', value: 5 }]);
      const prevChain = createFluentSelect([{ value: 0 }]);
      const totalChain = createFluentSelect([{ value: 5 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: prevChain.from })
        .mockReturnValueOnce({ from: totalChain.from });

      const result = await service.getUserGrowth('7d');

      expect(result.growthPercent).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // getProfileAnalytics
  // -------------------------------------------------------------------------

  describe('getProfileAnalytics', () => {
    it('should return profile analytics with top viewed', async () => {
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: 5 },
      ]);
      const topChain = createFluentSelect([
        { id: 'p1', displayName: 'Alice', viewsCount: 200 },
        { id: 'p2', displayName: 'Bob', viewsCount: 150 },
      ]);
      const avgChain = createFluentSelect([{ value: 75 }]);
      const activeChain = createFluentSelect([{ value: 50 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: topChain.from })
        .mockReturnValueOnce({ from: avgChain.from })
        .mockReturnValueOnce({ from: activeChain.from });

      const result = await service.getProfileAnalytics('30d');

      expect(result.period).toBe('30d');
      expect(result.newProfiles).toBe(5);
      expect(result.topViewed).toHaveLength(2);
      expect(result.averageViews).toBe(75);
      expect(result.totalActiveProfiles).toBe(50);
    });

    it('should handle empty profile analytics', async () => {
      const dailyChain = createFluentSelect([]);
      const topChain = createFluentSelect([]);
      const avgChain = createFluentSelect([{ value: 0 }]);
      const activeChain = createFluentSelect([{ value: 0 }]);

      mockDb.select
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: topChain.from })
        .mockReturnValueOnce({ from: avgChain.from })
        .mockReturnValueOnce({ from: activeChain.from });

      const result = await service.getProfileAnalytics('7d');

      expect(result.newProfiles).toBe(0);
      expect(result.topViewed).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getSearchAnalytics
  // -------------------------------------------------------------------------

  describe('getSearchAnalytics', () => {
    it('should return search analytics with top terms', async () => {
      const termsChain = createFluentSelect([
        { term: 'massage', count: 50 },
        { term: 'yoga', count: 30 },
      ]);
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: 40 },
        { date: '2026-03-02', value: 40 },
      ]);

      mockDb.select
        .mockReturnValueOnce({ from: termsChain.from })
        .mockReturnValueOnce({ from: dailyChain.from });

      const result = await service.getSearchAnalytics('7d');

      expect(result.period).toBe('7d');
      expect(result.totalSearches).toBe(80);
      expect(result.topSearchTerms).toHaveLength(2);
      expect(result.dailySearches).toHaveLength(2);
    });

    it('should handle no search data', async () => {
      const termsChain = createFluentSelect([]);
      const dailyChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce({ from: termsChain.from })
        .mockReturnValueOnce({ from: dailyChain.from });

      const result = await service.getSearchAnalytics('30d');

      expect(result.totalSearches).toBe(0);
      expect(result.topSearchTerms).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getCategoryAnalytics
  // -------------------------------------------------------------------------

  describe('getCategoryAnalytics', () => {
    it('should return category analytics with profile counts', async () => {
      const catChain = createFluentSelect([
        { id: 'cat-1', name: 'Massage', slug: 'massage', profileCount: 25 },
        { id: 'cat-2', name: 'Yoga', slug: 'yoga', profileCount: 15 },
      ]);
      mockDb.select.mockReturnValue({ from: catChain.from });

      const result = await service.getCategoryAnalytics();

      expect(result.totalCategories).toBe(2);
      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].profileCount).toBe(25);
    });

    it('should return empty when no categories', async () => {
      const catChain = createFluentSelect([]);
      mockDb.select.mockReturnValue({ from: catChain.from });

      const result = await service.getCategoryAnalytics();

      expect(result.totalCategories).toBe(0);
      expect(result.categories).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getModerationAnalytics
  // -------------------------------------------------------------------------

  describe('getModerationAnalytics', () => {
    it('should return moderation analytics with status counts', async () => {
      const statusChain = createFluentSelect([
        { status: 'pending', count: 10 },
        { status: 'approved', count: 80 },
        { status: 'rejected', count: 20 },
        { status: 'escalated', count: 5 },
      ]);
      const dailyChain = createFluentSelect([
        { date: '2026-03-01', value: 50 },
      ]);
      const avgChain = createFluentSelect([{ value: 4.5 }]);

      mockDb.select
        .mockReturnValueOnce({ from: statusChain.from })
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: avgChain.from });

      const result = await service.getModerationAnalytics('30d');

      expect(result.period).toBe('30d');
      expect(result.pendingCount).toBe(10);
      expect(result.approvedCount).toBe(80);
      expect(result.rejectedCount).toBe(20);
      expect(result.escalatedCount).toBe(5);
      expect(result.approvalRate).toBe(80);
      expect(result.averageResolutionHours).toBe(4.5);
    });

    it('should handle zero resolved items with 0 approval rate', async () => {
      const statusChain = createFluentSelect([
        { status: 'pending', count: 5 },
      ]);
      const dailyChain = createFluentSelect([]);
      const avgChain = createFluentSelect([{ value: 0 }]);

      mockDb.select
        .mockReturnValueOnce({ from: statusChain.from })
        .mockReturnValueOnce({ from: dailyChain.from })
        .mockReturnValueOnce({ from: avgChain.from });

      const result = await service.getModerationAnalytics('7d');

      expect(result.approvalRate).toBe(0);
      expect(result.rejectedCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getOverviewDashboard
  // -------------------------------------------------------------------------

  describe('getOverviewDashboard', () => {
    it('should return a complete overview dashboard', async () => {
      // Revenue current
      const revCurrentChain = createFluentSelect([{ value: '10000' }]);
      // Revenue previous
      const revPrevChain = createFluentSelect([{ value: '8000' }]);
      // Total users
      const totalUsersChain = createFluentSelect([{ value: 1000 }]);
      // New users current
      const newUsersChain = createFluentSelect([{ value: 50 }]);
      // New users previous
      const prevUsersChain = createFluentSelect([{ value: 40 }]);
      // Active profiles
      const activeProfilesChain = createFluentSelect([{ value: 200 }]);
      // New profiles
      const newProfilesChain = createFluentSelect([{ value: 15 }]);
      // Pending moderation
      const pendingModChain = createFluentSelect([{ value: 8 }]);
      // Approved moderation
      const modApprovedChain = createFluentSelect([{ value: 90 }]);
      // Total resolved moderation
      const modTotalChain = createFluentSelect([{ value: 100 }]);
      // Active subscriptions
      const subsChain = createFluentSelect([{ value: 75 }]);
      // Top categories
      const topCatsChain = createFluentSelect([
        { name: 'Massage', profileCount: 30 },
        { name: 'Yoga', profileCount: 20 },
      ]);

      mockDb.select
        .mockReturnValueOnce({ from: revCurrentChain.from })
        .mockReturnValueOnce({ from: revPrevChain.from })
        .mockReturnValueOnce({ from: totalUsersChain.from })
        .mockReturnValueOnce({ from: newUsersChain.from })
        .mockReturnValueOnce({ from: prevUsersChain.from })
        .mockReturnValueOnce({ from: activeProfilesChain.from })
        .mockReturnValueOnce({ from: newProfilesChain.from })
        .mockReturnValueOnce({ from: pendingModChain.from })
        .mockReturnValueOnce({ from: modApprovedChain.from })
        .mockReturnValueOnce({ from: modTotalChain.from })
        .mockReturnValueOnce({ from: subsChain.from })
        .mockReturnValueOnce({ from: topCatsChain.from });

      const result = await service.getOverviewDashboard();

      expect(result.revenue.total).toBe(10000);
      expect(result.revenue.growthPercent).toBe(25);
      expect(result.users.total).toBe(1000);
      expect(result.users.newThisPeriod).toBe(50);
      expect(result.profiles.active).toBe(200);
      expect(result.profiles.newThisPeriod).toBe(15);
      expect(result.moderation.pending).toBe(8);
      expect(result.moderation.approvalRate).toBe(90);
      expect(result.subscriptions.active).toBe(75);
      expect(result.topCategories).toHaveLength(2);
    });

    it('should handle all-zero dashboard data', async () => {
      const zeroChain = createFluentSelect([{ value: 0 }]);
      const nullChain = createFluentSelect([{ value: null }]);
      const emptyChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce({ from: nullChain.from })  // rev current
        .mockReturnValueOnce({ from: nullChain.from })  // rev prev
        .mockReturnValueOnce({ from: zeroChain.from })  // total users
        .mockReturnValueOnce({ from: zeroChain.from })  // new users
        .mockReturnValueOnce({ from: zeroChain.from })  // prev users
        .mockReturnValueOnce({ from: zeroChain.from })  // active profiles
        .mockReturnValueOnce({ from: zeroChain.from })  // new profiles
        .mockReturnValueOnce({ from: zeroChain.from })  // pending mod
        .mockReturnValueOnce({ from: zeroChain.from })  // mod approved
        .mockReturnValueOnce({ from: zeroChain.from })  // mod total
        .mockReturnValueOnce({ from: zeroChain.from })  // subs
        .mockReturnValueOnce({ from: emptyChain.from }); // top cats

      const result = await service.getOverviewDashboard();

      expect(result.revenue.total).toBe(0);
      expect(result.revenue.growthPercent).toBe(0);
      expect(result.users.total).toBe(0);
      expect(result.topCategories).toHaveLength(0);
    });
  });
});
