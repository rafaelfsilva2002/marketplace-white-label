import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PricingService } from './pricing.service';

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
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockResolvedValue(rows);
  const groupBy = vi.fn().mockReturnValue({
    orderBy,
  });
  const where = vi.fn().mockReturnValue({
    groupBy,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const from = vi.fn().mockReturnValue({
    where,
    then: (r: any) => Promise.resolve(rows).then(r),
  });

  return { from, where, groupBy, limit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PricingService', () => {
  let service: PricingService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
    };

    service = new PricingService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // suggestPlan
  // -------------------------------------------------------------------------

  describe('suggestPlan', () => {
    it('should suggest premium for high traffic + excellent rating', async () => {
      // 1. assertProfileExists
      const profileChain = chainedSelect([{ id: 'p1' }]);
      // 2. views30d
      const viewsChain = chainedSelect([{ total: 600 }]);
      // 3. uniqueViews30d
      const uniqueChain = chainedSelect([{ unique: 400 }]);
      // 4. reviewCount + avgRating
      const reviewChain = chainedSelect([{ reviewCount: 30, avgRating: '4.8' }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        return { from: reviewChain.from };
      });

      const result = await service.suggestPlan('p1');

      expect(result.suggestedPlan).toBe('premium');
      expect(result.reason).toContain('High traffic');
      expect(result.metrics.views30d).toBe(600);
      expect(result.metrics.avgRating).toBe(4.8);
    });

    it('should suggest professional for strong traffic + good rating', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 250 }]);
      const uniqueChain = chainedSelect([{ unique: 180 }]);
      const reviewChain = chainedSelect([{ reviewCount: 15, avgRating: '4.2' }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        return { from: reviewChain.from };
      });

      const result = await service.suggestPlan('p1');

      expect(result.suggestedPlan).toBe('professional');
      expect(result.reason).toContain('Strong traffic');
    });

    it('should suggest basic for growing traffic', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 80 }]);
      const uniqueChain = chainedSelect([{ unique: 60 }]);
      const reviewChain = chainedSelect([{ reviewCount: 5, avgRating: '3.5' }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        return { from: reviewChain.from };
      });

      const result = await service.suggestPlan('p1');

      expect(result.suggestedPlan).toBe('basic');
      expect(result.reason).toContain('Growing traffic');
    });

    it('should suggest free for low traffic profiles', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 10 }]);
      const uniqueChain = chainedSelect([{ unique: 8 }]);
      const reviewChain = chainedSelect([{ reviewCount: 1, avgRating: '5.0' }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        return { from: reviewChain.from };
      });

      const result = await service.suggestPlan('p1');

      expect(result.suggestedPlan).toBe('free');
      expect(result.reason).toContain('Early stage');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      const profileChain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: profileChain.from });

      await expect(service.suggestPlan('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include profile id in the not found message', async () => {
      const profileChain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: profileChain.from });

      await expect(service.suggestPlan('missing-id')).rejects.toThrow(
        'Profile with id missing-id not found',
      );
    });

    it('should default avgRating to 0 when no reviews exist', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 600 }]);
      const uniqueChain = chainedSelect([{ unique: 400 }]);
      const reviewChain = chainedSelect([{ reviewCount: 0, avgRating: null }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        return { from: reviewChain.from };
      });

      const result = await service.suggestPlan('p1');

      expect(result.metrics.avgRating).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getAnalytics
  // -------------------------------------------------------------------------

  describe('getAnalytics', () => {
    it('should return complete analytics for a profile', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 100 }]);
      const uniqueChain = chainedSelect([{ unique: 80 }]);
      const reviewChain = chainedSelect([{ reviewCount: 10, avgRating: '4.5' }]);
      const trendsChain = chainedSelect([{ date: '2026-03-01', views: 5 }]);
      const distChain = chainedSelect([{ rating: 5, count: 8 }, { rating: 4, count: 2 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        if (callCount === 4) return { from: reviewChain.from };
        if (callCount === 5) return { from: trendsChain.from };
        return { from: distChain.from };
      });

      const result = await service.getAnalytics('p1');

      expect(result.profileId).toBe('p1');
      expect(result.metrics.views30d).toBe(100);
      expect(result.metrics.uniqueViews30d).toBe(80);
      expect(result.metrics.reviewCount).toBe(10);
      expect(result.metrics.avgRating).toBe(4.5);
      expect(result.viewTrends).toHaveLength(1);
      expect(result.ratingDistribution[5]).toBe(8);
      expect(result.ratingDistribution[4]).toBe(2);
      expect(result.ratingDistribution[1]).toBe(0);
      expect(typeof result.conversionEstimate).toBe('number');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      const profileChain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: profileChain.from });

      await expect(service.getAnalytics('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should compute conversionEstimate of 0 when views30d is 0', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 0 }]);
      const uniqueChain = chainedSelect([{ unique: 0 }]);
      const reviewChain = chainedSelect([{ reviewCount: 0, avgRating: null }]);
      const trendsChain = chainedSelect([]);
      const distChain = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        if (callCount === 4) return { from: reviewChain.from };
        if (callCount === 5) return { from: trendsChain.from };
        return { from: distChain.from };
      });

      const result = await service.getAnalytics('p1');

      expect(result.conversionEstimate).toBe(0);
    });

    it('should initialize rating distribution with zeros for all ratings 1-5', async () => {
      const profileChain = chainedSelect([{ id: 'p1' }]);
      const viewsChain = chainedSelect([{ total: 50 }]);
      const uniqueChain = chainedSelect([{ unique: 40 }]);
      const reviewChain = chainedSelect([{ reviewCount: 0, avgRating: null }]);
      const trendsChain = chainedSelect([]);
      const distChain = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: profileChain.from };
        if (callCount === 2) return { from: viewsChain.from };
        if (callCount === 3) return { from: uniqueChain.from };
        if (callCount === 4) return { from: reviewChain.from };
        if (callCount === 5) return { from: trendsChain.from };
        return { from: distChain.from };
      });

      const result = await service.getAnalytics('p1');

      expect(result.ratingDistribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });
  });
});
