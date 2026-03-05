import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, count, desc, asc, isNull } from 'drizzle-orm';
import {
  categories,
  profileCategories,
  profiles,
  type Database,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async findAll() {
    const allCategories = await this.db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    const topLevel = allCategories.filter((c) => !c.parentId);
    const children = allCategories.filter((c) => c.parentId);

    return topLevel.map((parent) => ({
      ...parent,
      children: children.filter((c) => c.parentId === parent.id),
    }));
  }

  async findBySlug(slug: string) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
      .limit(1);

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    const [profilesCountResult] = await this.db
      .select({ total: count() })
      .from(profileCategories)
      .where(eq(profileCategories.categoryId, category.id));

    const childCategories = await this.db
      .select()
      .from(categories)
      .where(
        and(eq(categories.parentId, category.id), eq(categories.isActive, true)),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    return {
      ...category,
      profilesCount: profilesCountResult?.total ?? 0,
      children: childCategories,
    };
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, dto.slug))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(`Category with slug "${dto.slug}" already exists`);
    }

    if (dto.parentId) {
      const parent = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, dto.parentId))
        .limit(1);

      if (parent.length === 0) {
        throw new NotFoundException(`Parent category with id "${dto.parentId}" not found`);
      }
    }

    const [created] = await this.db
      .insert(categories)
      .values({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        icon: dto.icon,
        parentId: dto.parentId,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    return created;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const [existing] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    if (dto.slug && dto.slug !== existing.slug) {
      const slugConflict = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, dto.slug))
        .limit(1);

      if (slugConflict.length > 0) {
        throw new ConflictException(`Category with slug "${dto.slug}" already exists`);
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.parentId !== undefined) updateData.parentId = dto.parentId;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const [updated] = await this.db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();

    return updated;
  }

  async getProfilesByCategory(
    categoryId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const offset = (page - 1) * limit;

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(profileCategories)
      .innerJoin(profiles, eq(profileCategories.profileId, profiles.id))
      .where(
        and(
          eq(profileCategories.categoryId, categoryId),
          eq(profiles.isActive, true),
        ),
      );

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        displayName: profiles.displayName,
        bio: profiles.bio,
        description: profiles.description,
        city: profiles.city,
        state: profiles.state,
        services: profiles.services,
        photos: profiles.photos,
        isVerified: profiles.isVerified,
        isActive: profiles.isActive,
        viewsCount: profiles.viewsCount,
        searchScore: profiles.searchScore,
        createdAt: profiles.createdAt,
      })
      .from(profileCategories)
      .innerJoin(profiles, eq(profileCategories.profileId, profiles.id))
      .where(
        and(
          eq(profileCategories.categoryId, categoryId),
          eq(profiles.isActive, true),
        ),
      )
      .orderBy(desc(profiles.searchScore), desc(profiles.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getProfilesByCategorySlug(
    slug: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const category = await this.findBySlug(slug);
    const result = await this.getProfilesByCategory(category.id, page, limit);
    return { ...result, category };
  }
}
