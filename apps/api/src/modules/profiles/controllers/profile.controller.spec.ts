import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import type { CreateProfileDto } from '../dto/create-profile.dto';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import type { JwtUser } from '@/modules/auth/strategies/jwt.strategy';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_PROFILE = {
  id: 'profile-uuid-1',
  userId: 'user-uuid-1',
  displayName: 'Jane Doe',
  bio: 'Professional developer',
  description: 'Full-stack engineer with 10 years of experience',
  location: 'Sao Paulo, BR',
  city: 'Sao Paulo',
  state: 'SP',
  country: 'BR',
  address: 'Av. Paulista, 1000',
  services: ['web-development', 'consulting'],
  priceRange: { min: 100, max: 500 },
  photos: ['photo1.jpg'],
  isActive: true,
  searchScore: 0,
  viewsCount: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const FAKE_JWT_USER: JwtUser = {
  id: 'user-uuid-1',
  email: 'jane@example.com',
  role: 'professional',
};

const FAKE_PAGINATED_RESULT = {
  data: [FAKE_PROFILE],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const FAKE_VIEW_STATS = {
  totalViews: 150,
  uniqueViewers: 80,
  viewsLast24h: 10,
  viewsLast7d: 45,
  viewsLast30d: 120,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileController', () => {
  let controller: ProfileController;
  let mockProfileService: Record<string, ReturnType<typeof vi.fn>>;
  let mockProfileViewsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockUploadService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockProfileService = {
      findAll: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };

    mockProfileViewsService = {
      recordView: vi.fn().mockResolvedValue(undefined),
      getViewStats: vi.fn(),
    };

    mockUploadService = {
      transformPhotosToCdn: vi.fn((photos: string[]) => photos),
      getCdnUrl: vi.fn((key: string) => key),
      getImageUrl: vi.fn((key: string) => key),
      getOptimizedProfilePhoto: vi.fn((key: string) => key),
    };

    controller = new ProfileController(
      mockProfileService as any,
      mockProfileViewsService as any,
      mockUploadService as any,
    );
  });

  // -------------------------------------------------------------------------
  // GET /profiles
  // -------------------------------------------------------------------------

  describe('GET /profiles', () => {
    it('should call profileService.findAll with default pagination', async () => {
      mockProfileService.findAll.mockResolvedValue(FAKE_PAGINATED_RESULT);

      const result = await controller.findAll(1, 20);

      expect(mockProfileService.findAll).toHaveBeenCalledWith(
        1,
        20,
        undefined,
        undefined,
      );
      expect(result).toEqual(FAKE_PAGINATED_RESULT);
    });

    it('should pass city and state filters to profileService.findAll', async () => {
      mockProfileService.findAll.mockResolvedValue(FAKE_PAGINATED_RESULT);

      const result = await controller.findAll(1, 10, 'Sao Paulo', 'SP');

      expect(mockProfileService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'Sao Paulo',
        'SP',
      );
      expect(result).toEqual(FAKE_PAGINATED_RESULT);
    });

    it('should pass custom page and limit values', async () => {
      const emptyResult = { data: [], total: 0, page: 3, limit: 5, totalPages: 0 };
      mockProfileService.findAll.mockResolvedValue(emptyResult);

      const result = await controller.findAll(3, 5);

      expect(mockProfileService.findAll).toHaveBeenCalledWith(
        3,
        5,
        undefined,
        undefined,
      );
      expect(result).toEqual(emptyResult);
    });

    it('should propagate errors from profileService.findAll', async () => {
      mockProfileService.findAll.mockRejectedValue(new Error('DB connection error'));

      await expect(controller.findAll(1, 20)).rejects.toThrow('DB connection error');
    });
  });

  // -------------------------------------------------------------------------
  // POST /profiles
  // -------------------------------------------------------------------------

  describe('POST /profiles', () => {
    const createDto: CreateProfileDto = {
      userId: 'user-uuid-1',
      displayName: 'Jane Doe',
      bio: 'Professional developer',
      city: 'Sao Paulo',
      state: 'SP',
    };

    it('should call profileService.create with dto and correlationId', async () => {
      mockProfileService.create.mockResolvedValue(FAKE_PROFILE);

      const req = { correlationId: 'corr-create-1' };
      const result = await controller.create(createDto, FAKE_JWT_USER, req);

      expect(mockProfileService.create).toHaveBeenCalledWith(
        createDto,
        'corr-create-1',
      );
      expect(result).toEqual(FAKE_PROFILE);
    });

    it('should pass undefined correlationId when not present on request', async () => {
      mockProfileService.create.mockResolvedValue(FAKE_PROFILE);

      const req = {};
      const result = await controller.create(createDto, FAKE_JWT_USER, req);

      expect(mockProfileService.create).toHaveBeenCalledWith(
        createDto,
        undefined,
      );
      expect(result).toEqual(FAKE_PROFILE);
    });

    it('should propagate ConflictException when profile already exists', async () => {
      mockProfileService.create.mockRejectedValue(
        new Error('Profile already exists for this user'),
      );

      const req = { correlationId: 'corr-dup' };
      await expect(
        controller.create(createDto, FAKE_JWT_USER, req),
      ).rejects.toThrow('Profile already exists for this user');
    });
  });

  // -------------------------------------------------------------------------
  // GET /profiles/:id
  // -------------------------------------------------------------------------

  describe('GET /profiles/:id', () => {
    it('should return the profile and record a view', async () => {
      mockProfileService.findById.mockResolvedValue(FAKE_PROFILE);

      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Mozilla/5.0',
        },
        ip: '127.0.0.1',
        user: FAKE_JWT_USER,
      };

      const result = await controller.findById('profile-uuid-1', req);

      expect(mockProfileService.findById).toHaveBeenCalledWith('profile-uuid-1');
      expect(result).toEqual(FAKE_PROFILE);
      expect(mockProfileViewsService.recordView).toHaveBeenCalledWith({
        profileId: 'profile-uuid-1',
        viewerId: FAKE_JWT_USER.id,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        source: 'api',
      });
    });

    it('should use req.ip when x-forwarded-for is not present', async () => {
      mockProfileService.findById.mockResolvedValue(FAKE_PROFILE);

      const req = {
        headers: {
          'user-agent': 'TestAgent',
        },
        ip: '10.0.0.1',
        user: undefined,
      };

      await controller.findById('profile-uuid-1', req);

      expect(mockProfileViewsService.recordView).toHaveBeenCalledWith({
        profileId: 'profile-uuid-1',
        viewerId: undefined,
        ipAddress: '10.0.0.1',
        userAgent: 'TestAgent',
        source: 'api',
      });
    });

    it('should pass undefined viewerId when user is not authenticated', async () => {
      mockProfileService.findById.mockResolvedValue(FAKE_PROFILE);

      const req = {
        headers: {},
        ip: '127.0.0.1',
        user: undefined,
      };

      await controller.findById('profile-uuid-1', req);

      expect(mockProfileViewsService.recordView).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId: undefined }),
      );
    });

    it('should propagate NotFoundException from profileService.findById', async () => {
      mockProfileService.findById.mockRejectedValue(
        new NotFoundException('Profile with id nonexistent not found'),
      );

      const req = { headers: {}, ip: '127.0.0.1', user: undefined };

      await expect(
        controller.findById('nonexistent', req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /profiles/:id
  // -------------------------------------------------------------------------

  describe('PATCH /profiles/:id', () => {
    const updateDto: UpdateProfileDto = {
      displayName: 'Jane Doe Updated',
      bio: 'Updated bio',
    };

    it('should call profileService.update with id, dto, userId, and correlationId', async () => {
      const updatedProfile = { ...FAKE_PROFILE, ...updateDto };
      mockProfileService.update.mockResolvedValue(updatedProfile);

      const req = { correlationId: 'corr-update-1' };
      const result = await controller.update(
        'profile-uuid-1',
        updateDto,
        FAKE_JWT_USER,
        req,
      );

      expect(mockProfileService.update).toHaveBeenCalledWith(
        'profile-uuid-1',
        updateDto,
        FAKE_JWT_USER.id,
        'corr-update-1',
      );
      expect(result).toEqual(updatedProfile);
    });

    it('should pass undefined correlationId when not present on request', async () => {
      mockProfileService.update.mockResolvedValue(FAKE_PROFILE);

      const req = {};
      await controller.update('profile-uuid-1', updateDto, FAKE_JWT_USER, req);

      expect(mockProfileService.update).toHaveBeenCalledWith(
        'profile-uuid-1',
        updateDto,
        FAKE_JWT_USER.id,
        undefined,
      );
    });

    it('should propagate NotFoundException from profileService.update', async () => {
      mockProfileService.update.mockRejectedValue(
        new NotFoundException('Profile with id unknown not found'),
      );

      const req = { correlationId: 'corr-update-fail' };
      await expect(
        controller.update('unknown', updateDto, FAKE_JWT_USER, req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /profiles/:id
  // -------------------------------------------------------------------------

  describe('DELETE /profiles/:id', () => {
    it('should call profileService.softDelete with id, userId, and correlationId', async () => {
      mockProfileService.softDelete.mockResolvedValue(undefined);

      const req = { correlationId: 'corr-delete-1' };
      await controller.softDelete('profile-uuid-1', FAKE_JWT_USER, req);

      expect(mockProfileService.softDelete).toHaveBeenCalledWith(
        'profile-uuid-1',
        FAKE_JWT_USER.id,
        'corr-delete-1',
      );
    });

    it('should return undefined (NO_CONTENT response)', async () => {
      mockProfileService.softDelete.mockResolvedValue(undefined);

      const req = { correlationId: 'corr-delete-2' };
      const result = await controller.softDelete(
        'profile-uuid-1',
        FAKE_JWT_USER,
        req,
      );

      expect(result).toBeUndefined();
    });

    it('should pass undefined correlationId when not present on request', async () => {
      mockProfileService.softDelete.mockResolvedValue(undefined);

      const req = {};
      await controller.softDelete('profile-uuid-1', FAKE_JWT_USER, req);

      expect(mockProfileService.softDelete).toHaveBeenCalledWith(
        'profile-uuid-1',
        FAKE_JWT_USER.id,
        undefined,
      );
    });

    it('should propagate NotFoundException from profileService.softDelete', async () => {
      mockProfileService.softDelete.mockRejectedValue(
        new NotFoundException('Profile with id unknown not found'),
      );

      const req = { correlationId: 'corr-delete-fail' };
      await expect(
        controller.softDelete('unknown', FAKE_JWT_USER, req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // GET /profiles/:id/views
  // -------------------------------------------------------------------------

  describe('GET /profiles/:id/views', () => {
    it('should return view statistics for the profile', async () => {
      mockProfileViewsService.getViewStats.mockResolvedValue(FAKE_VIEW_STATS);

      const result = await controller.getViewStats('profile-uuid-1');

      expect(mockProfileViewsService.getViewStats).toHaveBeenCalledWith(
        'profile-uuid-1',
      );
      expect(result).toEqual(FAKE_VIEW_STATS);
    });

    it('should propagate errors from profileViewsService.getViewStats', async () => {
      mockProfileViewsService.getViewStats.mockRejectedValue(
        new Error('Stats unavailable'),
      );

      await expect(
        controller.getViewStats('profile-uuid-1'),
      ).rejects.toThrow('Stats unavailable');
    });
  });
});
