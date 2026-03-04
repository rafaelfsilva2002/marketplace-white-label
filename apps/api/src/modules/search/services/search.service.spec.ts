import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService, type SearchParams } from './search.service';

// Mock the correlation-id helper
vi.mock('@/common/interceptors/correlation-id.interceptor', () => ({
  getCorrelationId: vi.fn().mockReturnValue('default-corr-id'),
  correlationStorage: {
    getStore: vi.fn().mockReturnValue({
      correlationId: 'default-corr-id',
      requestId: 'req-id',
      startTime: Date.now(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_PROFILE = {
  id: 'profile-uuid-1',
  userId: 'user-uuid-1',
  displayName: 'Ana Oliveira',
  bio: 'Massagista profissional',
  description: 'Servicos completos de massagem',
  location: null,
  city: 'Sao Paulo',
  state: 'SP',
  country: 'BR',
  address: null,
  services: ['massage', 'physiotherapy'],
  priceRange: { min: 100, max: 300 },
  photos: [],
  isActive: true,
  searchScore: 10,
  embedding: null,
  averageRating: 4.5,
  totalReviews: 12,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchService', () => {
  let service: SearchService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
    };

    service = new SearchService(mockDb as any);
  });

  // -----------------------------------------------------------------------
  // fullTextSearch
  // -----------------------------------------------------------------------

  describe('fullTextSearch', () => {
    it('should return search results with pagination', async () => {
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        }),
      };

      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([
                  { profile: FAKE_PROFILE, rank: 0.75 },
                ]),
              }),
            }),
          }),
        }),
      };

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return countSelect;
        return dataSelect;
      });

      const params: SearchParams = {
        query: 'massagem profissional',
        page: 1,
        limit: 20,
      };

      const result = await service.fullTextSearch(params);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].profile.id).toBe(FAKE_PROFILE.id);
      expect(result.data[0].rank).toBe(0.75);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should return empty result when query is empty or only special chars', async () => {
      const params: SearchParams = { query: '!@#$%' };

      const result = await service.fullTextSearch(params);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      // Should NOT hit the database
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should return empty result when query is whitespace-only', async () => {
      const params: SearchParams = { query: '   ' };

      const result = await service.fullTextSearch(params);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should use default page=1 and limit=20 when not provided', async () => {
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      };

      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      };

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return countSelect;
        return dataSelect;
      });

      const result = await service.fullTextSearch({ query: 'test' });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should handle city filter', async () => {
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        }),
      };

      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([
                  { profile: FAKE_PROFILE, rank: 0.5 },
                ]),
              }),
            }),
          }),
        }),
      };

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return countSelect;
        return dataSelect;
      });

      const params: SearchParams = {
        query: 'massage',
        city: 'Sao Paulo',
      };

      const result = await service.fullTextSearch(params);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].profile.city).toBe('Sao Paulo');
    });

    it('should sanitize special characters from query', async () => {
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      };

      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      };

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return countSelect;
        return dataSelect;
      });

      // Query with special characters that should be stripped
      const params: SearchParams = { query: "massage; DROP TABLE--" };

      const result = await service.fullTextSearch(params);

      // Should not throw, query is sanitized
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('should handle pagination correctly for page 2', async () => {
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 25 }]),
        }),
      };

      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([
                  { profile: { ...FAKE_PROFILE, id: 'p21' }, rank: 0.3 },
                ]),
              }),
            }),
          }),
        }),
      };

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return countSelect;
        return dataSelect;
      });

      const params: SearchParams = {
        query: 'test',
        page: 2,
        limit: 20,
      };

      const result = await service.fullTextSearch(params);

      expect(result.page).toBe(2);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // autocomplete
  // -----------------------------------------------------------------------

  describe('autocomplete', () => {
    it('should return autocomplete results', async () => {
      const autocompleteSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'profile-uuid-1',
                  displayName: 'Ana Oliveira',
                  city: 'Sao Paulo',
                  state: 'SP',
                  services: ['massage'],
                },
              ]),
            }),
          }),
        }),
      };

      mockDb.select.mockReturnValue(autocompleteSelect);

      const result = await service.autocomplete('Ana', 10);

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Ana Oliveira');
      expect(result[0].city).toBe('Sao Paulo');
    });

    it('should return empty array when query is empty', async () => {
      const result = await service.autocomplete('', 10);

      expect(result).toHaveLength(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should return empty array when query is only special characters', async () => {
      const result = await service.autocomplete('!!!', 5);

      expect(result).toHaveLength(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should use default limit of 10', async () => {
      const autocompleteSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      mockDb.select.mockReturnValue(autocompleteSelect);

      const result = await service.autocomplete('test');

      expect(result).toHaveLength(0);
    });
  });
});
