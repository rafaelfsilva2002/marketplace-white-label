import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import type { CreateProfileDto } from '../dto/create-profile.dto';
import type { UpdateProfileDto } from '../dto/update-profile.dto';

// Mock the correlation-id helper so we don't depend on async-local-storage
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

function chainedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

const FAKE_PROFILE = {
  id: 'profile-uuid-1',
  userId: 'user-uuid-1',
  displayName: 'Maria Silva',
  bio: 'Professional masseuse',
  description: 'Full description here',
  location: null,
  city: 'Sao Paulo',
  state: 'SP',
  country: 'BR',
  address: null,
  services: ['massage', 'physiotherapy'],
  priceRange: { min: 100, max: 500 },
  photos: [],
  isActive: true,
  searchScore: 0,
  embedding: null,
  averageRating: 0,
  totalReviews: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileService', () => {
  let service: ProfileService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockOutboxService: Record<string, ReturnType<typeof vi.fn>>;
  let mockAuditService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    };

    mockOutboxService = {
      writeEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    };

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new ProfileService(
      mockDb as any,
      mockOutboxService as any,
      mockAuditService as any,
    );
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    const dto: CreateProfileDto = {
      userId: 'user-uuid-1',
      displayName: 'Maria Silva',
      bio: 'Professional masseuse',
      city: 'Sao Paulo',
      state: 'SP',
      services: ['massage'],
    };

    it('should create a profile and emit an outbox event', async () => {
      // No existing profile
      mockDb.select.mockReturnValue(chainedSelect([]));

      // Transaction mock: the callback receives a `tx` object
      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([FAKE_PROFILE]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.create(dto, 'corr-1');

      expect(result.id).toBe(FAKE_PROFILE.id);
      expect(result.displayName).toBe('Maria Silva');
      expect(mockOutboxService.writeEvent).toHaveBeenCalledWith(
        expect.anything(), // tx object
        expect.objectContaining({
          eventType: 'marketplace.profile.created',
          aggregateType: 'profile',
          aggregateId: FAKE_PROFILE.id,
        }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: dto.userId,
          action: 'profile.created',
          entityType: 'profile',
          entityId: FAKE_PROFILE.id,
        }),
      );
    });

    it('should throw ConflictException if profile already exists for user', async () => {
      mockDb.select.mockReturnValue(
        chainedSelect([{ id: 'existing-profile' }]),
      );

      await expect(service.create(dto, 'corr-2')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(dto, 'corr-2')).rejects.toThrow(
        'Profile already exists for this user',
      );
    });
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------

  describe('findById', () => {
    it('should return a profile when it exists and is active', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PROFILE]));

      const result = await service.findById('profile-uuid-1');

      expect(result.id).toBe(FAKE_PROFILE.id);
      expect(result.displayName).toBe('Maria Silva');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('nonexistent')).rejects.toThrow(
        'Profile with id nonexistent not found',
      );
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    const updateDto: UpdateProfileDto = {
      displayName: 'Maria Updated',
      bio: 'Updated bio',
    };

    it('should update the profile fields and emit events', async () => {
      // findById call returns existing profile
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PROFILE]));

      const updatedProfile = {
        ...FAKE_PROFILE,
        displayName: 'Maria Updated',
        bio: 'Updated bio',
        updatedAt: new Date(),
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedProfile]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.update(
        'profile-uuid-1',
        updateDto,
        'user-uuid-1',
        'corr-3',
      );

      expect(result.displayName).toBe('Maria Updated');
      expect(result.bio).toBe('Updated bio');
      expect(mockOutboxService.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'marketplace.profile.updated',
          aggregateType: 'profile',
          aggregateId: 'profile-uuid-1',
        }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'profile.updated',
          entityType: 'profile',
          entityId: 'profile-uuid-1',
        }),
      );
    });

    it('should throw NotFoundException when profile to update does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(
        service.update('nonexistent', updateDto, 'user-1', 'corr-4'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // softDelete
  // -----------------------------------------------------------------------

  describe('softDelete', () => {
    it('should set isActive to false and record audit', async () => {
      // findById returns existing
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PROFILE]));

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await service.softDelete('profile-uuid-1', 'user-uuid-1', 'corr-5');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'profile.soft_deleted',
          entityType: 'profile',
          entityId: 'profile-uuid-1',
        }),
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(
        service.softDelete('nonexistent', 'user-1', 'corr-6'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------

  describe('findAll', () => {
    it('should return paginated results', async () => {
      // Count query
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        }),
      };

      // Data query
      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([FAKE_PROFILE]),
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

      const result = await service.findAll(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });
  });
});
