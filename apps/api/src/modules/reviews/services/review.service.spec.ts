import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import type { CreateReviewDto } from '../dto/create-review.dto';
import type { UpdateReviewDto } from '../dto/update-review.dto';

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

const FAKE_REVIEW = {
  id: 'review-uuid-1',
  profileId: 'profile-uuid-1',
  reviewerId: 'user-uuid-1',
  rating: 5,
  comment: 'Excellent service!',
  isVisible: 'true',
  sentimentScore: null,
  createdAt: new Date('2025-02-01'),
  updatedAt: new Date('2025-02-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewService', () => {
  let service: ReviewService;
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

    service = new ReviewService(
      mockDb as any,
      mockOutboxService as any,
      mockAuditService as any,
    );
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    const dto: CreateReviewDto = {
      profileId: 'profile-uuid-1',
      rating: 5,
      comment: 'Excellent service!',
    };
    const reviewerId = 'user-uuid-1';
    const correlationId = 'corr-review-1';

    it('should create a review and emit outbox event', async () => {
      // No existing review for this user/profile
      mockDb.select.mockReturnValue(chainedSelect([]));

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([FAKE_REVIEW]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.create(dto, reviewerId, correlationId);

      expect(result.id).toBe(FAKE_REVIEW.id);
      expect(result.rating).toBe(5);
      expect(result.comment).toBe('Excellent service!');

      expect(mockOutboxService.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'marketplace.review.created',
          aggregateType: 'review',
          aggregateId: FAKE_REVIEW.id,
          payload: expect.objectContaining({
            reviewId: FAKE_REVIEW.id,
            profileId: FAKE_REVIEW.profileId,
            reviewerId: FAKE_REVIEW.reviewerId,
            rating: 5,
          }),
        }),
      );

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: reviewerId,
          action: 'review.created',
          entityType: 'review',
          entityId: FAKE_REVIEW.id,
        }),
      );
    });

    it('should throw ConflictException when duplicate review exists', async () => {
      // Existing review found
      mockDb.select.mockReturnValue(
        chainedSelect([{ id: 'existing-review' }]),
      );

      await expect(
        service.create(dto, reviewerId, correlationId),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create(dto, reviewerId, correlationId),
      ).rejects.toThrow('You have already reviewed this profile');
    });

    it('should create a review without a comment', async () => {
      const dtoNoComment: CreateReviewDto = {
        profileId: 'profile-uuid-1',
        rating: 4,
      };

      mockDb.select.mockReturnValue(chainedSelect([]));

      const reviewNoComment = { ...FAKE_REVIEW, comment: null, rating: 4 };
      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([reviewNoComment]),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.create(dtoNoComment, reviewerId, correlationId);

      expect(result.rating).toBe(4);
      expect(result.comment).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // findByProfile
  // -----------------------------------------------------------------------

  describe('findByProfile', () => {
    it('should return paginated reviews for a profile', async () => {
      const countSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 2 }]),
        }),
      };

      const dataSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([FAKE_REVIEW, { ...FAKE_REVIEW, id: 'review-2' }]),
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

      const result = await service.findByProfile('profile-uuid-1', 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should return empty result when no reviews exist', async () => {
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

      const result = await service.findByProfile('profile-uuid-1');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------

  describe('findById', () => {
    it('should return the review when it exists', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_REVIEW]));

      const result = await service.findById('review-uuid-1');

      expect(result.id).toBe(FAKE_REVIEW.id);
      expect(result.rating).toBe(5);
    });

    it('should throw NotFoundException when review does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('nonexistent')).rejects.toThrow(
        'Review with id nonexistent not found',
      );
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    const updateDto: UpdateReviewDto = {
      rating: 4,
      comment: 'Updated comment',
    };

    it('should update the review when the user is the owner', async () => {
      // findById returns existing review
      mockDb.select.mockReturnValue(chainedSelect([FAKE_REVIEW]));

      const updatedReview = {
        ...FAKE_REVIEW,
        rating: 4,
        comment: 'Updated comment',
        updatedAt: new Date(),
      };

      mockDb.transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedReview]),
              }),
            }),
          }),
        };
        return cb(tx);
      });

      const result = await service.update(
        'review-uuid-1',
        updateDto,
        'user-uuid-1', // same as FAKE_REVIEW.reviewerId
        'corr-update-1',
      );

      expect(result.rating).toBe(4);
      expect(result.comment).toBe('Updated comment');
      expect(mockOutboxService.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'marketplace.review.updated',
        }),
      );
    });

    it('should throw ForbiddenException when user is not the review owner', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_REVIEW]));

      await expect(
        service.update('review-uuid-1', updateDto, 'different-user', 'corr-3'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update('review-uuid-1', updateDto, 'different-user', 'corr-3'),
      ).rejects.toThrow('You can only update your own reviews');
    });

    it('should throw NotFoundException when review does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(
        service.update('nonexistent', updateDto, 'user-1', 'corr-4'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // delete (soft delete)
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('should soft-delete by setting isVisible to false', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_REVIEW]));

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await service.delete('review-uuid-1', 'user-uuid-1', 'corr-del-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'review.deleted',
          entityType: 'review',
          entityId: 'review-uuid-1',
        }),
      );
    });

    it('should throw ForbiddenException when user is not the review owner', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_REVIEW]));

      await expect(
        service.delete('review-uuid-1', 'other-user', 'corr-del-2'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.delete('review-uuid-1', 'other-user', 'corr-del-2'),
      ).rejects.toThrow('You can only delete your own reviews');
    });

    it('should throw NotFoundException when review does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(
        service.delete('nonexistent', 'user-1', 'corr-del-3'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
