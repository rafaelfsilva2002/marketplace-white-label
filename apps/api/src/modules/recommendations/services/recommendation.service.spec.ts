import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RecommendationService } from './recommendation.service';

// ---------------------------------------------------------------------------
// Mock correlation-id interceptor (must also export correlationStorage
// because StructuredLogger imports it directly)
// ---------------------------------------------------------------------------

vi.mock('@/common/interceptors/correlation-id.interceptor', () => ({
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
  correlationStorage: new AsyncLocalStorage(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_EMBEDDING = [0.1, 0.2, 0.3, 0.4, 0.5];

const FAKE_PROFILE_1 = {
  id: 'profile-1',
  userId: 'user-1',
  displayName: 'Alice Pro',
  isActive: true,
  isVerified: true,
  embedding: FAKE_EMBEDDING,
  searchScore: 90,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const FAKE_PROFILE_2 = {
  id: 'profile-2',
  userId: 'user-2',
  displayName: 'Bob Pro',
  isActive: true,
  isVerified: true,
  embedding: [0.15, 0.25, 0.35, 0.45, 0.55],
  searchScore: 85,
  createdAt: new Date('2025-02-01'),
  updatedAt: new Date('2025-02-01'),
};

/**
 * Creates a fluent Drizzle-like chain for SELECT queries.
 * The key is that Drizzle query builders are "thenable" -- they resolve
 * when awaited at any point in the chain. So each intermediate object
 * needs to also be thenable (have .then) to resolve to `rows`, plus
 * have the next chain method.
 */
function createFluentSelect(rows: unknown[]) {
  // Make a promise-like that also has chaining methods
  const makeThennable = (extra: Record<string, unknown> = {}) => {
    const obj = {
      then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
      ...extra,
    };
    return obj;
  };

  const limit = vi.fn().mockResolvedValue(rows);

  // orderBy returns a thenable with .limit
  const orderBy = vi.fn().mockReturnValue(makeThennable({ limit }));

  // where returns a thenable with .orderBy and .limit
  const where = vi.fn().mockReturnValue(
    makeThennable({ orderBy, limit }),
  );

  // from returns a thenable with .where
  const from = vi.fn().mockReturnValue(makeThennable({ where }));

  return makeThennable({ from });
}

// ---------------------------------------------------------------------------
// Tests
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
    it('should fall back to top-rated profiles when user has no view history', async () => {
      // 1. Recent views (empty)
      const viewsChain = createFluentSelect([]);
      // 2. Top-rated profiles fallback
      const topRatedChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, avgRating: 4.8 },
        { profile: FAKE_PROFILE_2, avgRating: 4.5 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getRecommendations('user-new');

      expect(results).toHaveLength(2);
      expect(results[0].reason).toBe('top_rated');
      expect(results[1].reason).toBe('top_rated');
    });

    it('should use embedding similarity when user has viewed profiles with embeddings', async () => {
      // 1. Recent views
      const viewsChain = createFluentSelect([
        { profileId: 'profile-1' },
      ]);
      // 2. Fetch embeddings of viewed profiles
      const embeddingsChain = createFluentSelect([
        { embedding: FAKE_EMBEDDING },
      ]);
      // 3. Similar profiles by embedding
      const similarChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.95 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(embeddingsChain)
        .mockReturnValueOnce(similarChain);

      const results = await service.getRecommendations('user-1', 10);

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('embedding_similarity');
      expect(results[0].similarity).toBe(0.95);
    });

    it('should fall back to top-rated when viewed profiles have no embeddings', async () => {
      // 1. Recent views
      const viewsChain = createFluentSelect([
        { profileId: 'profile-no-emb' },
      ]);
      // 2. Fetch embeddings -- null / empty
      const embeddingsChain = createFluentSelect([
        { embedding: null },
      ]);
      // 3. Top-rated fallback
      const topRatedChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, avgRating: 4.8 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(embeddingsChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getRecommendations('user-2');

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('top_rated');
    });

    it('should respect the limit parameter', async () => {
      const viewsChain = createFluentSelect([]);
      const topRatedChain = createFluentSelect([
        { profile: FAKE_PROFILE_1, avgRating: 4.8 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getRecommendations('user-new', 5);

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 10 when limit is not provided', async () => {
      const viewsChain = createFluentSelect([]);
      const topRatedChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getRecommendations('user-new');

      expect(results).toEqual([]);
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it('should use provided correlationId without throwing', async () => {
      const viewsChain = createFluentSelect([]);
      const topRatedChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getRecommendations(
        'user-new',
        10,
        'custom-corr-123',
      );

      expect(results).toEqual([]);
    });

    it('should exclude viewed profile IDs from top-rated fallback when views have no embeddings', async () => {
      // 1. User has viewed profile-1
      const viewsChain = createFluentSelect([
        { profileId: 'profile-1' },
      ]);
      // 2. Viewed profiles have no embeddings
      const embeddingsChain = createFluentSelect([
        { embedding: null },
      ]);
      // 3. Top-rated fallback excludes viewed IDs
      const topRatedChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, avgRating: 4.5 },
      ]);

      mockDb.select
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(embeddingsChain)
        .mockReturnValueOnce(topRatedChain);

      const results = await service.getRecommendations('user-1');

      expect(results).toHaveLength(1);
      expect(results[0].profile.id).toBe('profile-2');
    });
  });

  // -------------------------------------------------------------------------
  // getSimilarProfiles
  // -------------------------------------------------------------------------

  describe('getSimilarProfiles', () => {
    it('should return similar profiles based on embedding similarity', async () => {
      // 1. Fetch target profile
      const profileChain = createFluentSelect([
        { id: 'profile-1', embedding: FAKE_EMBEDDING },
      ]);
      // 2. Similar profiles
      const similarChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.92 },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(similarChain);

      const results = await service.getSimilarProfiles('profile-1');

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('embedding_similarity');
      expect(results[0].similarity).toBe(0.92);
      expect(results[0].profile.id).toBe('profile-2');
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

    it('should fall back to top-rated profiles when target has no embedding', async () => {
      // 1. Profile exists but has no embedding
      const profileChain = createFluentSelect([
        { id: 'profile-no-emb', embedding: null },
      ]);
      // 2. Top-rated fallback
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
        { id: 'profile-empty-emb', embedding: [] },
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
        { id: 'profile-1', embedding: FAKE_EMBEDDING },
      ]);
      const similarChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: 0.88 },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(similarChain);

      const results = await service.getSimilarProfiles('profile-1', 5);

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 10 when not specified', async () => {
      const profileChain = createFluentSelect([
        { id: 'profile-1', embedding: FAKE_EMBEDDING },
      ]);
      const similarChain = createFluentSelect([]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(similarChain);

      const results = await service.getSimilarProfiles('profile-1');

      expect(results).toEqual([]);
    });

    it('should convert similarity values to numbers', async () => {
      const profileChain = createFluentSelect([
        { id: 'profile-1', embedding: FAKE_EMBEDDING },
      ]);
      // DB might return string-like numbers
      const similarChain = createFluentSelect([
        { profile: FAKE_PROFILE_2, similarity: '0.87' },
      ]);

      mockDb.select
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(similarChain);

      const results = await service.getSimilarProfiles('profile-1');

      expect(typeof results[0].similarity).toBe('number');
      expect(results[0].similarity).toBe(0.87);
    });
  });
});
