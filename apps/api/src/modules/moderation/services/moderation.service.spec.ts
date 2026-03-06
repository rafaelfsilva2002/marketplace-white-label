import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ModerationService } from './moderation.service';

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

function createChainedSelect(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limitAfterOrder = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit: limitAfterOrder });

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy,
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function createChainedSelectWithLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function createChainedUpdate(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const FAKE_PROFILE = {
  id: 'profile-uuid-1',
  userId: 'user-uuid-1',
  displayName: 'Test Professional',
  isVerified: false,
  isActive: true,
  createdAt: new Date('2025-06-01'),
  updatedAt: new Date('2025-06-01'),
};

const FAKE_REVIEW = {
  id: 'review-uuid-1',
  profileId: 'profile-uuid-1',
  userId: 'user-uuid-2',
  rating: 4,
  comment: 'Great service!',
  isVisible: 'true',
  moderatedBy: null,
  moderatedAt: null,
  createdAt: new Date('2025-06-15'),
  updatedAt: new Date('2025-06-15'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModerationService', () => {
  let service: ModerationService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockAuditService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      execute: vi.fn(),
      update: vi.fn(),
    };

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new ModerationService(
      mockDb as any,
      mockAuditService as any,
    );
  });

  // -------------------------------------------------------------------------
  // getQueue
  // -------------------------------------------------------------------------

  describe('getQueue', () => {
    it('should return paginated moderation queue with profiles and reviews', async () => {
      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]))
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]));

      mockDb.execute.mockResolvedValueOnce([
        {
          id: FAKE_REVIEW.id,
          type: 'review',
          entityId: FAKE_REVIEW.id,
          displayName: null,
          comment: FAKE_REVIEW.comment,
          rating: FAKE_REVIEW.rating,
          createdAt: FAKE_REVIEW.createdAt,
          status: 'pending_moderation',
        },
        {
          id: FAKE_PROFILE.id,
          type: 'profile',
          entityId: FAKE_PROFILE.id,
          displayName: FAKE_PROFILE.displayName,
          comment: null,
          rating: null,
          createdAt: FAKE_PROFILE.createdAt,
          status: 'pending_verification',
        },
      ]);

      const result = await service.getQueue(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by profile type only', async () => {
      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]))
        .mockReturnValueOnce(
          createChainedSelect([
            {
              id: FAKE_PROFILE.id,
              type: 'profile',
              entityId: FAKE_PROFILE.id,
              displayName: FAKE_PROFILE.displayName,
              comment: null,
              rating: null,
              createdAt: FAKE_PROFILE.createdAt,
              status: 'pending_verification',
            },
          ]),
        );

      const result = await service.getQueue(1, 20, 'profile');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('profile');
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('should filter by review type only', async () => {
      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]))
        .mockReturnValueOnce(
          createChainedSelect([
            {
              id: FAKE_REVIEW.id,
              type: 'review',
              entityId: FAKE_REVIEW.id,
              displayName: null,
              comment: FAKE_REVIEW.comment,
              rating: FAKE_REVIEW.rating,
              createdAt: FAKE_REVIEW.createdAt,
              status: 'pending_moderation',
            },
          ]),
        );

      const result = await service.getQueue(1, 20, 'review');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('review');
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('should return empty data when no pending items exist', async () => {
      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 0 }]))
        .mockReturnValueOnce(createChainedSelect([{ total: 0 }]));
      mockDb.execute.mockResolvedValueOnce([]);

      const result = await service.getQueue(1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should paginate results correctly', async () => {
      const fakeProfiles = [
        { ...FAKE_PROFILE, id: 'p1', createdAt: new Date('2025-06-03') },
        { ...FAKE_PROFILE, id: 'p2', createdAt: new Date('2025-06-02') },
        { ...FAKE_PROFILE, id: 'p3', createdAt: new Date('2025-06-01') },
      ];

      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 3 }]))
        .mockReturnValueOnce(createChainedSelect([{ total: 0 }]));
      mockDb.execute.mockResolvedValueOnce([
        {
          id: 'p3',
          type: 'profile',
          entityId: 'p3',
          displayName: FAKE_PROFILE.displayName,
          comment: null,
          rating: null,
          createdAt: fakeProfiles[2].createdAt,
          status: 'pending_verification',
        },
      ]);

      const result = await service.getQueue(2, 2);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('should use default page=1 and limit=20', async () => {
      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 0 }]))
        .mockReturnValueOnce(createChainedSelect([{ total: 0 }]));
      mockDb.execute.mockResolvedValueOnce([]);

      const result = await service.getQueue();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should sort items by createdAt descending', async () => {
      const oldProfile = {
        ...FAKE_PROFILE,
        id: 'old-p',
        createdAt: new Date('2025-01-01'),
      };
      const newReview = {
        ...FAKE_REVIEW,
        id: 'new-r',
        createdAt: new Date('2025-12-01'),
      };

      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]))
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]));
      mockDb.execute.mockResolvedValueOnce([
        {
          id: 'new-r',
          type: 'review',
          entityId: 'new-r',
          displayName: null,
          comment: newReview.comment,
          rating: newReview.rating,
          createdAt: newReview.createdAt,
          status: 'pending_moderation',
        },
        {
          id: 'old-p',
          type: 'profile',
          entityId: 'old-p',
          displayName: oldProfile.displayName,
          comment: null,
          rating: null,
          createdAt: oldProfile.createdAt,
          status: 'pending_verification',
        },
      ]);

      const result = await service.getQueue(1, 20);

      expect(result.data[0].id).toBe('new-r');
      expect(result.data[1].id).toBe('old-p');
    });

    it('should coerce count values to number for typed filters', async () => {
      mockDb.select
        .mockReturnValueOnce(
          createChainedSelect([{ total: '5' as unknown as number }]),
        )
        .mockReturnValueOnce(
          createChainedSelect([
            {
              id: FAKE_PROFILE.id,
              type: 'profile',
              entityId: FAKE_PROFILE.id,
              displayName: FAKE_PROFILE.displayName,
              comment: null,
              rating: null,
              createdAt: FAKE_PROFILE.createdAt,
              status: 'pending_verification',
            },
          ]),
        );

      const result = await service.getQueue(1, 2, 'profile');

      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('should normalize union SQL rows with string dates and nullable fields', async () => {
      mockDb.select
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]))
        .mockReturnValueOnce(createChainedSelect([{ total: 1 }]));
      mockDb.execute.mockResolvedValueOnce([
        {
          id: 'review-string-date',
          type: 'review',
          entityId: 'review-string-date',
          displayName: null,
          comment: null,
          rating: null,
          createdAt: '2026-01-03T12:30:00.000Z',
          status: 'pending_moderation',
        },
      ]);

      const result = await service.getQueue(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].createdAt).toBeInstanceOf(Date);
      expect(result.data[0].createdAt.toISOString()).toBe(
        '2026-01-03T12:30:00.000Z',
      );
      expect(result.data[0].displayName).toBeUndefined();
      expect(result.data[0].comment).toBeUndefined();
      expect(result.data[0].rating).toBeUndefined();
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // approveProfile
  // -------------------------------------------------------------------------

  describe('approveProfile', () => {
    it('should update profile to verified and record audit entry', async () => {
      const updatedProfile = {
        ...FAKE_PROFILE,
        isVerified: true,
        verifiedBy: 'mod-1',
      };

      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([FAKE_PROFILE]),
      );
      mockDb.update.mockReturnValueOnce(createChainedUpdate([updatedProfile]));

      const result = await service.approveProfile('profile-uuid-1', 'mod-1');

      expect(result.isVerified).toBe(true);
      expect(result.verifiedBy).toBe('mod-1');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'mod-1',
          action: 'profile.approved',
          entityType: 'profile',
          entityId: 'profile-uuid-1',
        }),
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockDb.select.mockReturnValue(createChainedSelectWithLimit([]));

      await expect(
        service.approveProfile('nonexistent', 'mod-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.approveProfile('nonexistent', 'mod-1'),
      ).rejects.toThrow('Profile with id nonexistent not found');
    });

    it('should use provided correlationId', async () => {
      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([FAKE_PROFILE]),
      );
      mockDb.update.mockReturnValueOnce(
        createChainedUpdate([{ ...FAKE_PROFILE, isVerified: true }]),
      );

      await service.approveProfile('profile-uuid-1', 'mod-1', 'custom-corr');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'custom-corr',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // rejectProfile
  // -------------------------------------------------------------------------

  describe('rejectProfile', () => {
    it('should deactivate profile and record audit entry', async () => {
      const updatedProfile = { ...FAKE_PROFILE, isActive: false };

      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([FAKE_PROFILE]),
      );
      mockDb.update.mockReturnValueOnce(createChainedUpdate([updatedProfile]));

      const result = await service.rejectProfile(
        'profile-uuid-1',
        'mod-1',
        'Inappropriate content',
      );

      expect(result.isActive).toBe(false);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'profile.rejected',
          metadata: { reason: 'Inappropriate content' },
        }),
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockDb.select.mockReturnValue(createChainedSelectWithLimit([]));

      await expect(
        service.rejectProfile('nonexistent', 'mod-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not include metadata when no reason is provided', async () => {
      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([FAKE_PROFILE]),
      );
      mockDb.update.mockReturnValueOnce(
        createChainedUpdate([{ ...FAKE_PROFILE, isActive: false }]),
      );

      await service.rejectProfile('profile-uuid-1', 'mod-1');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: undefined,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // approveReview
  // -------------------------------------------------------------------------

  describe('approveReview', () => {
    it('should set moderatedBy and keep isVisible as true', async () => {
      const updatedReview = {
        ...FAKE_REVIEW,
        moderatedBy: 'mod-1',
        moderatedAt: new Date(),
        isVisible: 'true',
      };

      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([FAKE_REVIEW]),
      );
      mockDb.update.mockReturnValueOnce(createChainedUpdate([updatedReview]));

      const result = await service.approveReview('review-uuid-1', 'mod-1');

      expect(result.moderatedBy).toBe('mod-1');
      expect(result.isVisible).toBe('true');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'review.approved',
          entityType: 'review',
          entityId: 'review-uuid-1',
        }),
      );
    });

    it('should throw NotFoundException when review does not exist', async () => {
      mockDb.select.mockReturnValue(createChainedSelectWithLimit([]));

      await expect(
        service.approveReview('nonexistent', 'mod-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.approveReview('nonexistent', 'mod-1'),
      ).rejects.toThrow('Review with id nonexistent not found');
    });
  });

  // -------------------------------------------------------------------------
  // rejectReview
  // -------------------------------------------------------------------------

  describe('rejectReview', () => {
    it('should set isVisible to false and record audit entry with reason', async () => {
      const updatedReview = {
        ...FAKE_REVIEW,
        moderatedBy: 'mod-1',
        moderatedAt: new Date(),
        isVisible: 'false',
      };

      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([FAKE_REVIEW]),
      );
      mockDb.update.mockReturnValueOnce(createChainedUpdate([updatedReview]));

      const result = await service.rejectReview(
        'review-uuid-1',
        'mod-1',
        'Spam review',
      );

      expect(result.isVisible).toBe('false');
      expect(result.moderatedBy).toBe('mod-1');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'review.rejected',
          metadata: { reason: 'Spam review' },
        }),
      );
    });

    it('should throw NotFoundException when review does not exist', async () => {
      mockDb.select.mockReturnValue(createChainedSelectWithLimit([]));

      await expect(
        service.rejectReview('nonexistent', 'mod-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should record old isVisible value in audit oldValue', async () => {
      const reviewWithVisibleTrue = {
        ...FAKE_REVIEW,
        isVisible: 'true',
      };
      const updatedReview = {
        ...FAKE_REVIEW,
        isVisible: 'false',
        moderatedBy: 'mod-1',
      };

      mockDb.select.mockReturnValueOnce(
        createChainedSelectWithLimit([reviewWithVisibleTrue]),
      );
      mockDb.update.mockReturnValueOnce(createChainedUpdate([updatedReview]));

      await service.rejectReview('review-uuid-1', 'mod-1');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValue: { isVisible: 'true' },
          newValue: { isVisible: 'false', moderatedBy: 'mod-1' },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // approve (dispatch)
  // -------------------------------------------------------------------------

  describe('approve', () => {
    it('should delegate to approveProfile when type is profile', async () => {
      const spy = vi
        .spyOn(service, 'approveProfile')
        .mockResolvedValue(FAKE_PROFILE as any);

      await service.approve('profile-uuid-1', 'profile', 'mod-1', 'corr-1');

      expect(spy).toHaveBeenCalledWith('profile-uuid-1', 'mod-1', 'corr-1');
    });

    it('should delegate to approveReview when type is review', async () => {
      const spy = vi
        .spyOn(service, 'approveReview')
        .mockResolvedValue(FAKE_REVIEW as any);

      await service.approve('review-uuid-1', 'review', 'mod-1', 'corr-2');

      expect(spy).toHaveBeenCalledWith('review-uuid-1', 'mod-1', 'corr-2');
    });
  });

  // -------------------------------------------------------------------------
  // reject (dispatch)
  // -------------------------------------------------------------------------

  describe('reject', () => {
    it('should delegate to rejectProfile when type is profile', async () => {
      const spy = vi
        .spyOn(service, 'rejectProfile')
        .mockResolvedValue(FAKE_PROFILE as any);

      await service.reject(
        'profile-uuid-1',
        'profile',
        'mod-1',
        'Bad content',
        'corr-3',
      );

      expect(spy).toHaveBeenCalledWith(
        'profile-uuid-1',
        'mod-1',
        'Bad content',
        'corr-3',
      );
    });

    it('should delegate to rejectReview when type is review', async () => {
      const spy = vi
        .spyOn(service, 'rejectReview')
        .mockResolvedValue(FAKE_REVIEW as any);

      await service.reject(
        'review-uuid-1',
        'review',
        'mod-1',
        'Spam',
        'corr-4',
      );

      expect(spy).toHaveBeenCalledWith(
        'review-uuid-1',
        'mod-1',
        'Spam',
        'corr-4',
      );
    });
  });
});
