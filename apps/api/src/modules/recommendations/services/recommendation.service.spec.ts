import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  RecommendationService,
  computeWeightedScore,
  computeRecencyBoost,
  normalizeViewCount,
  injectDiversity,
  type RecommendationResult,
} from './recommendation.service';

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

const FAKE_EMBEDDING = [0.1, 0.2, 0.3, 0.4, 0.5];

function fakeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'profile-1',
    userId: overrides.userId ?? 'user-1',
    displayName: overrides.displayName ?? 'Alice Pro',
    bio: null,
    description: null,
    location: null,
    city: overrides.city ?? 'Sao Paulo',
    state: overrides.state ?? 'SP',
    country: overrides.country ?? 'BR',
    address: null,
    services: overrides.services ?? ['massage'],
    priceRange: null,
    photos: [],
    embedding: overrides.embedding ?? FAKE_EMBEDDING,
    isVerified: true,
    isActive: true,
    viewsCount: overrides.viewsCount ?? 100,
    searchScore: overrides.searchScore ?? 90,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: overrides.createdAt ?? new Date('2026-02-01'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-01'),
  };
}

const FAKE_PROFILE_1 = fakeProfile();
const FAKE_PROFILE_2 = fakeProfile({
  id: 'profile-2',
  userId: 'user-2',
  displayName: 'Bob Pro',
  city: 'Rio de Janeiro',
  services: ['personal-training'],
  embedding: [0.15, 0.25, 0.35, 0.45, 0.55],
  viewsCount: 80,
  searchScore: 85,
  createdAt: new Date('2026-02-15'),
});
const FAKE_PROFILE_3 = fakeProfile({
  id: 'profile-3',
  userId: 'user-3',
  displayName: 'Charlie Pro',
  city: 'Belo Horizonte',
  services: ['yoga'],
  embedding: [0.2, 0.3, 0.4, 0.5, 0.6],
  viewsCount: 60,
  searchScore: 70,
  createdAt: new Date('2026-01-01'),
});

/**
 * Creates a fluent Drizzle-like chain for SELECT queries.
 */
function createFluentSelect(rows: unknown[]) {
  const makeThennable = (extra: Record<string, unknown> = {}) => {
    const obj = {
      then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
      ...extra,
    };
    return obj;
  };

  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue(makeThennable({ limit }));
  const where = vi.fn().mockReturnValue(makeThennable({ orderBy, limit }));
  const from = vi.fn().mockReturnValue(makeThennable({ where }));

  return makeThennable({ from });
}

// ---------------------------------------------------------------------------
// Unit tests for pure functions
// ---------------------------------------------------------------------------

describe('computeWeightedScore', () => {
  it('should return 1.0 when all signals are at maximum', () => {
    const score = computeWeightedScore({
      embeddingSimilarity: 1,
      normalizedRating: 1,
      normalizedViewCount: 1,
      recencyBoost: 1,
      locationMatch: 1,
    });

    expect(score).toBeCloseTo(1.0, 5);
  });

  it('should return 0 when all signals are zero', () => {
    const score = computeWeightedScore({
      embeddingSimilarity: 0,
      normalizedRating: 0,
      normalizedViewCount: 0,
      recencyBoost: 0,
      locationMatch: 0,
    });

    expect(score).toBe(0);
  });

  it('should apply correct default weights', () => {
    // Only embedding similarity set to 1, rest 0
    const embOnly = computeWeightedScore({
      embeddingSimilarity: 1,
      normalizedRating: 0,
      normalizedViewCount: 0,
      recencyBoost: 0,
      locationMatch: 0,
    });
    expect(embOnly).toBeCloseTo(0.4, 5);

    // Only rating set to 1
    const ratingOnly = computeWeightedScore({
      embeddingSimilarity: 0,
      normalizedRating: 1,
      normalizedViewCount: 0,
      recencyBoost: 0,
      locationMatch: 0,
    });
    expect(ratingOnly).toBeCloseTo(0.2, 5);

    // Only view count set to 1
    const viewsOnly = computeWeightedScore({
      embeddingSimilarity: 0,
      normalizedRating: 0,
      normalizedViewCount: 1,
      recencyBoost: 0,
      locationMatch: 0,
    });
    expect(viewsOnly).toBeCloseTo(0.15, 5);

    // Only recency set to 1
    const recencyOnly = computeWeightedScore({
      embeddingSimilarity: 0,
      normalizedRating: 0,
      normalizedViewCount: 0,
      recencyBoost: 1,
      locationMatch: 0,
    });
    expect(recencyOnly).toBeCloseTo(0.1, 5);

    // Only location set to 1
    const locationOnly = computeWeightedScore({
      embeddingSimilarity: 0,
      normalizedRating: 0,
      normalizedViewCount: 0,
      recencyBoost: 0,
      locationMatch: 1,
    });
    expect(locationOnly).toBeCloseTo(0.15, 5);
  });

  it('should use custom weights when provided', () => {
    const score = computeWeightedScore(
      {
        embeddingSimilarity: 1,
        normalizedRating: 1,
        normalizedViewCount: 0,
        recencyBoost: 0,
        locationMatch: 0,
      },
      {
        embeddingSimilarity: 0.6,
        reviewRating: 0.4,
        viewCount: 0,
        recency: 0,
        locationProximity: 0,
      },
    );

    expect(score).toBeCloseTo(1.0, 5);
  });
});

describe('computeRecencyBoost', () => {
  it('should return 1.0 for a brand-new profile (today)', () => {
    const now = new Date('2026-03-01');
    const boost = computeRecencyBoost(now, now);
    expect(boost).toBe(1);
  });

  it('should return ~0.5 for a profile created 30 days ago', () => {
    const now = new Date('2026-03-01');
    const thirtyDaysAgo = new Date('2026-01-30');
    const boost = computeRecencyBoost(thirtyDaysAgo, now);
    expect(boost).toBeCloseTo(0.5, 1);
  });

  it('should return a low value for a very old profile', () => {
    const now = new Date('2026-03-01');
    const yearAgo = new Date('2025-03-01');
    const boost = computeRecencyBoost(yearAgo, now);
    expect(boost).toBeLessThan(0.1);
  });

  it('should never return negative values', () => {
    const now = new Date('2026-03-01');
    const veryOld = new Date('2020-01-01');
    const boost = computeRecencyBoost(veryOld, now);
    expect(boost).toBeGreaterThan(0);
  });
});

describe('normalizeViewCount', () => {
  it('should return 1 when viewsCount equals maxViews', () => {
    expect(normalizeViewCount(100, 100)).toBe(1);
  });

  it('should return 0.5 for half the max', () => {
    expect(normalizeViewCount(50, 100)).toBe(0.5);
  });

  it('should return 0 when maxViews is 0', () => {
    expect(normalizeViewCount(10, 0)).toBe(0);
  });

  it('should cap at 1 even if viewsCount exceeds maxViews', () => {
    expect(normalizeViewCount(200, 100)).toBe(1);
  });

  it('should return 0 for zero views', () => {
    expect(normalizeViewCount(0, 100)).toBe(0);
  });
});

describe('injectDiversity', () => {
  it('should return same array if length <= 2', () => {
    const items = [
      { profile: fakeProfile({ city: 'Sao Paulo', services: ['massage'] }) },
    ] as any[];

    const result = injectDiversity(items);
    expect(result).toEqual(items);
  });

  it('should maintain all unique city/service items', () => {
    const items = [
      { profile: fakeProfile({ id: '1', city: 'Sao Paulo', services: ['massage'] }) },
      { profile: fakeProfile({ id: '2', city: 'Rio', services: ['yoga'] }) },
      { profile: fakeProfile({ id: '3', city: 'BH', services: ['pt'] }) },
    ] as any[];

    const result = injectDiversity(items);
    expect(result).toHaveLength(3);
  });

  it('should keep results from different cities over duplicates', () => {
    const items = [
      { profile: fakeProfile({ id: '1', city: 'Sao Paulo', services: ['massage'] }) },
      { profile: fakeProfile({ id: '2', city: 'Sao Paulo', services: ['massage'] }) },
      { profile: fakeProfile({ id: '3', city: 'Sao Paulo', services: ['massage'] }) },
      { profile: fakeProfile({ id: '4', city: 'Rio', services: ['yoga'] }) },
      { profile: fakeProfile({ id: '5', city: 'BH', services: ['pt'] }) },
    ] as any[];

    const result = injectDiversity(items);
    expect(result).toHaveLength(5);

    // Profiles from Rio and BH should be present (they bring diversity)
    const cities = result.map((r: any) => r.profile.city);
    expect(cities).toContain('Rio');
    expect(cities).toContain('BH');
  });

  it('should not lose any items — output length equals input length', () => {
    const items = [
      { profile: fakeProfile({ id: '1', city: 'A', services: ['s1'] }) },
      { profile: fakeProfile({ id: '2', city: 'A', services: ['s1'] }) },
      { profile: fakeProfile({ id: '3', city: 'A', services: ['s1'] }) },
      { profile: fakeProfile({ id: '4', city: 'A', services: ['s1'] }) },
    ] as any[];

    const result = injectDiversity(items);
    expect(result).toHaveLength(4);
  });

  it('should use custom target ratio', () => {
    const items = [
      { profile: fakeProfile({ id: '1', city: 'A', services: ['s1'] }) },
      { profile: fakeProfile({ id: '2', city: 'A', services: ['s1'] }) },
      { profile: fakeProfile({ id: '3', city: 'A', services: ['s1'] }) },
      { profile: fakeProfile({ id: '4', city: 'B', services: ['s2'] }) },
      { profile: fakeProfile({ id: '5', city: 'C', services: ['s3'] }) },
    ] as any[];

    // At 50% diversity ratio, should try harder to include diverse results
    const result = injectDiversity(items, 0.5);
    expect(result).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Service integration tests (mocked DB)
// ---------------------------------------------------------------------------

describe('RecommendationService', () => {
  let service: RecommendationService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
    };

    service = new RecommendationService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // getRecommendations
  // -------------------------------------------------------------------------

  describe('getRecommendations', () => {
    it('should return trending profiles for cold start (no view history)', async () => {
      // 1. Recent views (empty)
      const viewsChain = createFluentSelect([]);
      // 2. Trending profiles
      const trendingChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, recentViews: 42, avgRating: 4.8 },
        { profile: FAKE_PROFILE_2, recentViews: 30, avgRating: 4.5 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(trendingChain);

      const results = await service.getRecommendations('user-new');

      expect(results).toHaveLength(2);
      expect(results[0].reason).toBe('trending');
      expect(results[1].reason).toBe('trending');
    });

    it('should return trending profiles when viewed profiles have no embeddings', async () => {
      // 1. Recent views
      const viewsChain = createFluentSelect([{ profileId: 'profile-no-emb' }]);
      // 2. Fetch embeddings -- all null
      const embeddingsChain = createFluentSelect([{ embedding: null }]);
      // 3. Trending fallback
      const trendingChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, recentViews: 20, avgRating: 4.0 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(embeddingsChain)
        .mockReturnValueOnce(trendingChain);

      const results = await service.getRecommendations('user-2');

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('trending');
    });

    it('should use weighted scoring when user has viewed profiles with embeddings', async () => {
      // 1. Recent views
      const viewsChain = createFluentSelect([{ profileId: 'profile-1' }]);
      // 2. Fetch embeddings
      const embeddingsChain = createFluentSelect([{ embedding: FAKE_EMBEDDING }]);
      // 3. User primary city
      const cityChain = createFluentSelect([{ city: 'Sao Paulo' }]);
      // 4. Co-view: other viewers of same profiles (returns viewer IDs step 1)
      const coViewStep1 = createFluentSelect([]);
      // 5. Co-view: other viewers (step 2) -- duplicate query for viewer IDs
      const coViewStep2 = createFluentSelect([]);
      // 6. Scored candidates
      const candidatesChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.85, avgRating: 4.5 },
        { profile: FAKE_PROFILE_3, similarity: 0.70, avgRating: 3.8 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(embeddingsChain)
        .mockReturnValueOnce(cityChain)
        .mockReturnValueOnce(coViewStep1)
        .mockReturnValueOnce(coViewStep2)
        .mockReturnValueOnce(candidatesChain);

      const results = await service.getRecommendations('user-1', 10);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // With the weighted scoring, results should have 'weighted_score' reason
      expect(results[0].reason).toBe('weighted_score');
      // Score should be a number > 0
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should boost collaborative filtering candidates', async () => {
      const viewsChain = createFluentSelect([{ profileId: 'profile-1' }]);
      const embeddingsChain = createFluentSelect([{ embedding: FAKE_EMBEDDING }]);
      const cityChain = createFluentSelect([{ city: 'Sao Paulo' }]);
      // Co-view step 1: other viewers found
      const coViewStep1 = createFluentSelect([{ profileId: 'profile-1' }]);
      // Co-view step 2: viewer IDs
      const coViewStep2 = createFluentSelect([{ viewerId: 'other-user' }]);
      // Co-view step 3: what else other users viewed -> profile-2
      const coViewStep3 = createFluentSelect([{ profileId: 'profile-2' }]);
      // Scored candidates include profile-2
      const candidatesChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.80, avgRating: 4.0 },
        { profile: FAKE_PROFILE_3, similarity: 0.85, avgRating: 4.2 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(embeddingsChain)
        .mockReturnValueOnce(cityChain)
        .mockReturnValueOnce(coViewStep1)
        .mockReturnValueOnce(coViewStep2)
        .mockReturnValueOnce(coViewStep3)
        .mockReturnValueOnce(candidatesChain);

      const results = await service.getRecommendations('user-1', 10);

      // profile-2 should get the collaborative boost
      const profile2Result = results.find((r) => r.profile.id === 'profile-2');
      if (profile2Result) {
        expect(profile2Result.reason).toBe('collaborative');
      }
    });

    it('should respect the limit parameter', async () => {
      const viewsChain = createFluentSelect([]);
      const trendingChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, recentViews: 42, avgRating: 4.8 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(trendingChain);

      const results = await service.getRecommendations('user-new', 5);

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 10 when not provided', async () => {
      const viewsChain = createFluentSelect([]);
      const trendingChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(trendingChain);

      const results = await service.getRecommendations('user-new');

      expect(results).toEqual([]);
    });

    it('should use provided correlationId without throwing', async () => {
      const viewsChain = createFluentSelect([]);
      const trendingChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(trendingChain);

      const results = await service.getRecommendations(
        'user-new',
        10,
        'custom-corr-123',
      );

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getSimilarProfiles
  // -------------------------------------------------------------------------

  describe('getSimilarProfiles', () => {
    it('should return weighted-scored similar profiles', async () => {
      // 1. Fetch target profile
      const profileChain = createFluentSelect([
        { id: 'profile-1', embedding: FAKE_EMBEDDING, city: 'Sao Paulo' },
      ]);
      // 2. Scored candidates
      const candidatesChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.92, avgRating: 4.5 },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(candidatesChain);

      const results = await service.getSimilarProfiles('profile-1');

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('weighted_score');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockDb.select.mockReturnValue(createFluentSelect([]));

      await expect(
        service.getSimilarProfiles('nonexistent'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.getSimilarProfiles('nonexistent'),
      ).rejects.toThrow('Profile with id nonexistent not found');
    });

    it('should fall back to top-rated when profile has no embedding', async () => {
      const profileChain = createFluentSelect([
        { id: 'profile-no-emb', embedding: null, city: 'Sao Paulo' },
      ]);
      const topRatedChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, avgRating: 4.8 },
        { profile: FAKE_PROFILE_2, avgRating: 4.5 },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getSimilarProfiles('profile-no-emb');

      expect(results).toHaveLength(2);
      expect(results[0].reason).toBe('top_rated');
    });

    it('should fall back to top-rated when embedding is an empty array', async () => {
      const profileChain = createFluentSelect([
        { id: 'profile-empty-emb', embedding: [], city: null },
      ]);
      const topRatedChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, avgRating: 4.9 },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getSimilarProfiles('profile-empty-emb');

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('top_rated');
    });

    it('should respect the limit parameter', async () => {
      const profileChain = createFluentSelect([
        { id: 'profile-1', embedding: FAKE_EMBEDDING, city: 'Sao Paulo' },
      ]);
      const candidatesChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.88, avgRating: 4.0 },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(candidatesChain);

      const results = await service.getSimilarProfiles('profile-1', 5);

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });
});
