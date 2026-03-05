import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsController } from './analytics.controller';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_OVERVIEW = {
  revenue: { total: 10000, growthPercent: 25 },
  users: { total: 1000, newThisPeriod: 50, growthPercent: 10 },
  profiles: { active: 200, newThisPeriod: 15 },
  moderation: { pending: 8, approvalRate: 90 },
  subscriptions: { active: 75 },
  topCategories: [{ name: 'Massage', profileCount: 30 }],
};

const FAKE_REVENUE = {
  period: '30d' as const,
  totalRevenue: 10000,
  dailyRevenue: [{ date: '2026-03-01', value: 5000 }],
  averageDailyRevenue: 333,
  growthPercent: 25,
  transactionCount: 100,
};

const FAKE_USER_GROWTH = {
  period: '30d' as const,
  totalNewUsers: 50,
  dailyNewUsers: [{ date: '2026-03-01', value: 10 }],
  growthPercent: 10,
  totalUsers: 1000,
};

const FAKE_PROFILE_ANALYTICS = {
  period: '30d' as const,
  newProfiles: 15,
  dailyNewProfiles: [{ date: '2026-03-01', value: 5 }],
  topViewed: [{ id: 'p1', displayName: 'Alice', viewsCount: 200 }],
  averageViews: 75,
  totalActiveProfiles: 200,
};

const FAKE_SEARCH_ANALYTICS = {
  period: '30d' as const,
  totalSearches: 500,
  topSearchTerms: [{ term: 'massage', count: 50 }],
  dailySearches: [{ date: '2026-03-01', value: 100 }],
};

const FAKE_CATEGORY_ANALYTICS = {
  categories: [
    { id: 'cat-1', name: 'Massage', slug: 'massage', profileCount: 25 },
  ],
  totalCategories: 1,
};

const FAKE_MODERATION_ANALYTICS = {
  period: '30d' as const,
  pendingCount: 10,
  approvedCount: 80,
  rejectedCount: 20,
  escalatedCount: 5,
  approvalRate: 80,
  dailyItems: [{ date: '2026-03-01', value: 50 }],
  averageResolutionHours: 4.5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockAnalyticsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAnalyticsService = {
      getOverviewDashboard: vi.fn(),
      getRevenueAnalytics: vi.fn(),
      getUserGrowth: vi.fn(),
      getProfileAnalytics: vi.fn(),
      getSearchAnalytics: vi.fn(),
      getCategoryAnalytics: vi.fn(),
      getModerationAnalytics: vi.fn(),
    };

    controller = new AnalyticsController(mockAnalyticsService as any);
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/overview
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/overview', () => {
    it('should return overview dashboard with success wrapper', async () => {
      mockAnalyticsService.getOverviewDashboard.mockResolvedValue(FAKE_OVERVIEW);

      const result = await controller.getOverview();

      expect(mockAnalyticsService.getOverviewDashboard).toHaveBeenCalled();
      expect(result).toEqual({ success: true, data: FAKE_OVERVIEW });
    });

    it('should propagate errors from analyticsService', async () => {
      mockAnalyticsService.getOverviewDashboard.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(controller.getOverview()).rejects.toThrow('DB error');
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/revenue
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/revenue', () => {
    it('should return revenue analytics with default 30d period', async () => {
      mockAnalyticsService.getRevenueAnalytics.mockResolvedValue(FAKE_REVENUE);

      const result = await controller.getRevenue();

      expect(mockAnalyticsService.getRevenueAnalytics).toHaveBeenCalledWith('30d');
      expect(result).toEqual({ success: true, data: FAKE_REVENUE });
    });

    it('should pass 7d period when specified', async () => {
      mockAnalyticsService.getRevenueAnalytics.mockResolvedValue(FAKE_REVENUE);

      await controller.getRevenue('7d');

      expect(mockAnalyticsService.getRevenueAnalytics).toHaveBeenCalledWith('7d');
    });

    it('should pass 90d period when specified', async () => {
      mockAnalyticsService.getRevenueAnalytics.mockResolvedValue(FAKE_REVENUE);

      await controller.getRevenue('90d');

      expect(mockAnalyticsService.getRevenueAnalytics).toHaveBeenCalledWith('90d');
    });

    it('should default to 30d for invalid period value', async () => {
      mockAnalyticsService.getRevenueAnalytics.mockResolvedValue(FAKE_REVENUE);

      await controller.getRevenue('invalid');

      expect(mockAnalyticsService.getRevenueAnalytics).toHaveBeenCalledWith('30d');
    });

    it('should propagate errors from getRevenueAnalytics', async () => {
      mockAnalyticsService.getRevenueAnalytics.mockRejectedValue(
        new Error('Revenue error'),
      );

      await expect(controller.getRevenue()).rejects.toThrow('Revenue error');
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/users
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/users', () => {
    it('should return user growth analytics', async () => {
      mockAnalyticsService.getUserGrowth.mockResolvedValue(FAKE_USER_GROWTH);

      const result = await controller.getUserGrowth();

      expect(mockAnalyticsService.getUserGrowth).toHaveBeenCalledWith('30d');
      expect(result).toEqual({ success: true, data: FAKE_USER_GROWTH });
    });

    it('should pass custom period', async () => {
      mockAnalyticsService.getUserGrowth.mockResolvedValue(FAKE_USER_GROWTH);

      await controller.getUserGrowth('7d');

      expect(mockAnalyticsService.getUserGrowth).toHaveBeenCalledWith('7d');
    });

    it('should propagate errors', async () => {
      mockAnalyticsService.getUserGrowth.mockRejectedValue(new Error('User error'));

      await expect(controller.getUserGrowth()).rejects.toThrow('User error');
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/profiles
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/profiles', () => {
    it('should return profile analytics', async () => {
      mockAnalyticsService.getProfileAnalytics.mockResolvedValue(FAKE_PROFILE_ANALYTICS);

      const result = await controller.getProfiles();

      expect(mockAnalyticsService.getProfileAnalytics).toHaveBeenCalledWith('30d');
      expect(result).toEqual({ success: true, data: FAKE_PROFILE_ANALYTICS });
    });

    it('should pass custom period', async () => {
      mockAnalyticsService.getProfileAnalytics.mockResolvedValue(FAKE_PROFILE_ANALYTICS);

      await controller.getProfiles('90d');

      expect(mockAnalyticsService.getProfileAnalytics).toHaveBeenCalledWith('90d');
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/search
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/search', () => {
    it('should return search analytics', async () => {
      mockAnalyticsService.getSearchAnalytics.mockResolvedValue(FAKE_SEARCH_ANALYTICS);

      const result = await controller.getSearch();

      expect(mockAnalyticsService.getSearchAnalytics).toHaveBeenCalledWith('30d');
      expect(result).toEqual({ success: true, data: FAKE_SEARCH_ANALYTICS });
    });

    it('should pass 7d period', async () => {
      mockAnalyticsService.getSearchAnalytics.mockResolvedValue(FAKE_SEARCH_ANALYTICS);

      await controller.getSearch('7d');

      expect(mockAnalyticsService.getSearchAnalytics).toHaveBeenCalledWith('7d');
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/categories
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/categories', () => {
    it('should return category analytics', async () => {
      mockAnalyticsService.getCategoryAnalytics.mockResolvedValue(FAKE_CATEGORY_ANALYTICS);

      const result = await controller.getCategories();

      expect(mockAnalyticsService.getCategoryAnalytics).toHaveBeenCalled();
      expect(result).toEqual({ success: true, data: FAKE_CATEGORY_ANALYTICS });
    });

    it('should propagate errors from getCategoryAnalytics', async () => {
      mockAnalyticsService.getCategoryAnalytics.mockRejectedValue(
        new Error('Category error'),
      );

      await expect(controller.getCategories()).rejects.toThrow('Category error');
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/analytics/moderation
  // -------------------------------------------------------------------------

  describe('GET /admin/analytics/moderation', () => {
    it('should return moderation analytics', async () => {
      mockAnalyticsService.getModerationAnalytics.mockResolvedValue(
        FAKE_MODERATION_ANALYTICS,
      );

      const result = await controller.getModeration();

      expect(mockAnalyticsService.getModerationAnalytics).toHaveBeenCalledWith('30d');
      expect(result).toEqual({ success: true, data: FAKE_MODERATION_ANALYTICS });
    });

    it('should pass custom period', async () => {
      mockAnalyticsService.getModerationAnalytics.mockResolvedValue(
        FAKE_MODERATION_ANALYTICS,
      );

      await controller.getModeration('90d');

      expect(mockAnalyticsService.getModerationAnalytics).toHaveBeenCalledWith('90d');
    });

    it('should propagate errors from getModerationAnalytics', async () => {
      mockAnalyticsService.getModerationAnalytics.mockRejectedValue(
        new Error('Moderation error'),
      );

      await expect(controller.getModeration()).rejects.toThrow('Moderation error');
    });
  });
});
