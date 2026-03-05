import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainedSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const offset = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({ offset }),
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const where = vi.fn().mockReturnValue({
    orderBy,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const innerJoin = vi.fn().mockReturnValue({
    where,
    orderBy,
    then: (r: any) => Promise.resolve(rows).then(r),
  });
  const from = vi.fn().mockReturnValue({
    where,
    orderBy,
    innerJoin,
    limit,
    then: (r: any) => Promise.resolve(rows).then(r),
  });

  return { from, where, orderBy, limit, offset, innerJoin };
}

function chainedInsert(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function chainedUpdate(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const FAKE_PARENT_CATEGORY = {
  id: 'cat-parent-1',
  name: 'Services',
  slug: 'services',
  description: 'All services',
  icon: 'briefcase',
  parentId: null,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const FAKE_CHILD_CATEGORY = {
  id: 'cat-child-1',
  name: 'Massage',
  slug: 'massage',
  description: 'Massage services',
  icon: 'hand',
  parentId: 'cat-parent-1',
  isActive: true,
  sortOrder: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const FAKE_PROFILE = {
  id: 'profile-1',
  userId: 'user-1',
  displayName: 'Jane',
  bio: 'Professional',
  description: 'Experienced professional',
  city: 'Sao Paulo',
  state: 'SP',
  services: [],
  photos: [],
  isVerified: true,
  isActive: true,
  viewsCount: 100,
  searchScore: 50,
  createdAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    service = new CategoriesService(mockDb as any);
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('should return categories as a tree with parents and children', async () => {
      const chain = chainedSelect([FAKE_PARENT_CATEGORY, FAKE_CHILD_CATEGORY]);
      mockDb.select.mockReturnValue({ from: chain.from });

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(FAKE_PARENT_CATEGORY.id);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe(FAKE_CHILD_CATEGORY.id);
    });

    it('should return empty array when no categories exist', async () => {
      const chain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: chain.from });

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('should return parent with empty children array when no children exist', async () => {
      const chain = chainedSelect([FAKE_PARENT_CATEGORY]);
      mockDb.select.mockReturnValue({ from: chain.from });

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].children).toEqual([]);
    });

    it('should handle multiple parents each with their own children', async () => {
      const parent2 = { ...FAKE_PARENT_CATEGORY, id: 'cat-parent-2', name: 'Other' };
      const child2 = { ...FAKE_CHILD_CATEGORY, id: 'cat-child-2', parentId: 'cat-parent-2' };

      const chain = chainedSelect([FAKE_PARENT_CATEGORY, parent2, FAKE_CHILD_CATEGORY, child2]);
      mockDb.select.mockReturnValue({ from: chain.from });

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('cat-child-1');
      expect(result[1].children).toHaveLength(1);
      expect(result[1].children[0].id).toBe('cat-child-2');
    });
  });

  // -------------------------------------------------------------------------
  // findBySlug
  // -------------------------------------------------------------------------

  describe('findBySlug', () => {
    it('should return the category with profilesCount and children', async () => {
      const catChain = chainedSelect([FAKE_PARENT_CATEGORY]);
      const countChain = chainedSelect([{ total: 5 }]);
      const childrenChain = chainedSelect([FAKE_CHILD_CATEGORY]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: catChain.from };
        if (callCount === 2) return { from: countChain.from };
        return { from: childrenChain.from };
      });

      const result = await service.findBySlug('services');

      expect(result.id).toBe(FAKE_PARENT_CATEGORY.id);
      expect(result.profilesCount).toBe(5);
      expect(result.children).toHaveLength(1);
    });

    it('should throw NotFoundException when slug does not exist', async () => {
      const catChain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: catChain.from });

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include slug in the error message', async () => {
      const catChain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: catChain.from });

      await expect(service.findBySlug('missing-slug')).rejects.toThrow(
        'Category with slug "missing-slug" not found',
      );
    });

    it('should default profilesCount to 0 when count result is null', async () => {
      const catChain = chainedSelect([FAKE_PARENT_CATEGORY]);
      const countChain = chainedSelect([undefined]);
      const childrenChain = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: catChain.from };
        if (callCount === 2) return { from: countChain.from };
        return { from: childrenChain.from };
      });

      const result = await service.findBySlug('services');

      expect(result.profilesCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('should create a new category and return it', async () => {
      const slugCheck = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: slugCheck.from });
      mockDb.insert.mockReturnValue(chainedInsert([FAKE_PARENT_CATEGORY]));

      const result = await service.create({
        name: 'Services',
        slug: 'services',
        description: 'All services',
        icon: 'briefcase',
      });

      expect(result).toEqual(FAKE_PARENT_CATEGORY);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw ConflictException when slug already exists', async () => {
      const slugCheck = chainedSelect([{ id: 'existing-id' }]);
      mockDb.select.mockReturnValue({ from: slugCheck.from });

      await expect(
        service.create({ name: 'Dup', slug: 'services' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should include slug in the conflict error message', async () => {
      const slugCheck = chainedSelect([{ id: 'existing-id' }]);
      mockDb.select.mockReturnValue({ from: slugCheck.from });

      await expect(
        service.create({ name: 'Dup', slug: 'taken-slug' }),
      ).rejects.toThrow('Category with slug "taken-slug" already exists');
    });

    it('should throw NotFoundException when parentId does not exist', async () => {
      const slugCheck = chainedSelect([]);
      const parentCheck = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: slugCheck.from };
        return { from: parentCheck.from };
      });

      await expect(
        service.create({
          name: 'Child',
          slug: 'child',
          parentId: 'nonexistent-parent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create a category with parentId when parent exists', async () => {
      const slugCheck = chainedSelect([]);
      const parentCheck = chainedSelect([{ id: 'cat-parent-1' }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: slugCheck.from };
        return { from: parentCheck.from };
      });
      mockDb.insert.mockReturnValue(chainedInsert([FAKE_CHILD_CATEGORY]));

      const result = await service.create({
        name: 'Massage',
        slug: 'massage',
        parentId: 'cat-parent-1',
      });

      expect(result.parentId).toBe('cat-parent-1');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('should update a category and return it', async () => {
      const existingChain = chainedSelect([FAKE_PARENT_CATEGORY]);
      mockDb.select.mockReturnValue({ from: existingChain.from });

      const updated = { ...FAKE_PARENT_CATEGORY, name: 'Updated Services' };
      mockDb.update.mockReturnValue(chainedUpdate([updated]));

      const result = await service.update('cat-parent-1', { name: 'Updated Services' });

      expect(result.name).toBe('Updated Services');
    });

    it('should throw NotFoundException when category does not exist', async () => {
      const existingChain = chainedSelect([]);
      mockDb.select.mockReturnValue({ from: existingChain.from });

      await expect(
        service.update('nonexistent', { name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when new slug already exists', async () => {
      const existingChain = chainedSelect([FAKE_PARENT_CATEGORY]);
      const slugConflictChain = chainedSelect([{ id: 'other-cat' }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: existingChain.from };
        return { from: slugConflictChain.from };
      });

      await expect(
        service.update('cat-parent-1', { slug: 'existing-slug' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should not check slug conflict when slug is unchanged', async () => {
      const existingChain = chainedSelect([FAKE_PARENT_CATEGORY]);
      mockDb.select.mockReturnValue({ from: existingChain.from });

      const updated = { ...FAKE_PARENT_CATEGORY, name: 'New Name' };
      mockDb.update.mockReturnValue(chainedUpdate([updated]));

      const result = await service.update('cat-parent-1', {
        slug: 'services', // same slug
        name: 'New Name',
      });

      expect(result.name).toBe('New Name');
      // select should be called only once (for existing check, not slug conflict)
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // getProfilesByCategory
  // -------------------------------------------------------------------------

  describe('getProfilesByCategory', () => {
    it('should return paginated profiles for a category', async () => {
      const totalChain = chainedSelect([{ total: 1 }]);
      const profilesChain = chainedSelect([FAKE_PROFILE]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: totalChain.from };
        return { from: profilesChain.from };
      });

      const result = await service.getProfilesByCategory('cat-parent-1', 1, 20);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('profile-1');
    });

    it('should return empty data and total 0 when no profiles exist', async () => {
      const totalChain = chainedSelect([{ total: 0 }]);
      const profilesChain = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: totalChain.from };
        return { from: profilesChain.from };
      });

      const result = await service.getProfilesByCategory('cat-parent-1');

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
      expect(result.totalPages).toBe(0);
    });

    it('should compute totalPages correctly for multiple pages', async () => {
      const totalChain = chainedSelect([{ total: 45 }]);
      const profilesChain = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: totalChain.from };
        return { from: profilesChain.from };
      });

      const result = await service.getProfilesByCategory('cat-parent-1', 1, 20);

      expect(result.totalPages).toBe(3);
    });

    it('should default to 0 total when totalResult is undefined', async () => {
      const totalChain = chainedSelect([undefined]);
      const profilesChain = chainedSelect([]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: totalChain.from };
        return { from: profilesChain.from };
      });

      const result = await service.getProfilesByCategory('cat-parent-1');

      expect(result.total).toBe(0);
    });
  });
});
