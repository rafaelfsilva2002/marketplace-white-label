import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { profiles, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { CreateProfileDto } from '../dto/create-profile.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import type { PaginatedResult } from '@marketplace/shared';

@Injectable()
export class ProfileService {
  private readonly logger = new StructuredLogger('ProfileService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateProfileDto, correlationId?: string): Promise<typeof profiles.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const existing = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, dto.userId))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Profile already exists for this user');
    }

    const result = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(profiles)
        .values({
          userId: dto.userId,
          displayName: dto.displayName,
          bio: dto.bio,
          description: dto.description,
          location: dto.location,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          address: dto.address,
          services: dto.services ?? [],
          priceRange: dto.priceRange,
          photos: dto.photos ?? [],
        })
        .returning();

      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.profile.created',
        aggregateType: 'profile',
        aggregateId: created.id,
        payload: {
          profileId: created.id,
          userId: created.userId,
          displayName: created.displayName,
          city: created.city,
          state: created.state,
          services: created.services,
        },
        correlationId: corrId,
      });

      return created;
    });

    await this.auditService.record({
      userId: dto.userId,
      action: 'profile.created',
      entityType: 'profile',
      entityId: result.id,
      newValue: result as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile created',
      { profileId: result.id, userId: dto.userId, correlationId: corrId },
      'ProfileService',
    );

    return result;
  }

  async findById(id: string): Promise<typeof profiles.$inferSelect> {
    const [profile] = await this.db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, id), eq(profiles.isActive, true)))
      .limit(1);

    if (!profile) {
      throw new NotFoundException(`Profile with id ${id} not found`);
    }

    return profile;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    city?: string,
    state?: string,
  ): Promise<PaginatedResult<typeof profiles.$inferSelect>> {
    const offset = (page - 1) * limit;

    const conditions = [eq(profiles.isActive, true)];

    if (city) {
      conditions.push(eq(profiles.city, city));
    }
    if (state) {
      conditions.push(eq(profiles.state, state));
    }

    const whereClause = and(...conditions);

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(profiles)
      .where(whereClause);

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select()
      .from(profiles)
      .where(whereClause)
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

  async update(
    id: string,
    dto: UpdateProfileDto,
    userId: string,
    correlationId?: string,
  ): Promise<typeof profiles.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const existing = await this.findById(id);

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.bio !== undefined) updateData.bio = dto.bio;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.services !== undefined) updateData.services = dto.services;
    if (dto.priceRange !== undefined) updateData.priceRange = dto.priceRange;
    if (dto.photos !== undefined) updateData.photos = dto.photos;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(profiles)
        .set(updateData)
        .where(eq(profiles.id, id))
        .returning();

      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.profile.updated',
        aggregateType: 'profile',
        aggregateId: id,
        payload: {
          profileId: id,
          userId: existing.userId,
          updatedFields: Object.keys(dto).filter(
            (k) => (dto as Record<string, unknown>)[k] !== undefined,
          ),
        },
        correlationId: corrId,
      });

      return updated;
    });

    await this.auditService.record({
      userId,
      action: 'profile.updated',
      entityType: 'profile',
      entityId: id,
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: result as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile updated',
      { profileId: id, correlationId: corrId },
      'ProfileService',
    );

    return result;
  }

  async softDelete(id: string, userId: string, correlationId?: string): Promise<void> {
    const corrId = correlationId ?? getCorrelationId();

    const existing = await this.findById(id);

    await this.db
      .update(profiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(profiles.id, id));

    await this.auditService.record({
      userId,
      action: 'profile.soft_deleted',
      entityType: 'profile',
      entityId: id,
      oldValue: existing as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile soft deleted',
      { profileId: id, correlationId: corrId },
      'ProfileService',
    );
  }

  async removePhoto(
    id: string,
    photoIndex: number,
    userId: string,
    correlationId?: string,
  ): Promise<{ message: string; photos: string[] }> {
    const corrId = correlationId ?? getCorrelationId();

    const profile = await this.findById(id);

    if (profile.userId !== userId) {
      throw new ForbiddenException('You can only remove photos from your own profile');
    }

    if (photoIndex < 0 || photoIndex >= profile.photos.length) {
      throw new BadRequestException(
        `Invalid photo index ${photoIndex}. Profile has ${profile.photos.length} photo(s)`,
      );
    }

    const removedPhoto = profile.photos[photoIndex];
    const updatedPhotos = [...profile.photos];
    updatedPhotos.splice(photoIndex, 1);

    await this.db
      .update(profiles)
      .set({ photos: updatedPhotos, updatedAt: new Date() })
      .where(eq(profiles.id, id));

    await this.auditService.record({
      userId,
      action: 'profile.photo_removed',
      entityType: 'profile',
      entityId: id,
      oldValue: { photos: profile.photos },
      newValue: { photos: updatedPhotos },
      metadata: { removedPhoto, photoIndex },
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile photo removed',
      { profileId: id, photoIndex, correlationId: corrId },
      'ProfileService',
    );

    return { message: 'Photo removed successfully', photos: updatedPhotos };
  }

  async addPhotos(
    id: string,
    photoUrls: string[],
    userId: string,
    correlationId?: string,
  ): Promise<{ message: string; photos: string[] }> {
    const corrId = correlationId ?? getCorrelationId();

    const profile = await this.findById(id);

    if (profile.userId !== userId) {
      throw new ForbiddenException('You can only add photos to your own profile');
    }

    const updatedPhotos = [...profile.photos, ...photoUrls];

    await this.db
      .update(profiles)
      .set({ photos: updatedPhotos, updatedAt: new Date() })
      .where(eq(profiles.id, id));

    await this.auditService.record({
      userId,
      action: 'profile.photos_added',
      entityType: 'profile',
      entityId: id,
      oldValue: { photos: profile.photos },
      newValue: { photos: updatedPhotos },
      correlationId: corrId,
    });

    return { message: 'Photos added successfully', photos: updatedPhotos };
  }

  async requestVerification(
    id: string,
    userId: string,
    correlationId?: string,
  ): Promise<{ message: string }> {
    const corrId = correlationId ?? getCorrelationId();

    const profile = await this.findById(id);

    if (profile.userId !== userId) {
      throw new ForbiddenException('You can only request verification for your own profile');
    }

    if (profile.isVerified) {
      throw new ConflictException('Profile is already verified');
    }

    await this.outboxService.writeEvent(this.db as any, {
      eventType: 'marketplace.profile.verification_requested',
      aggregateType: 'profile',
      aggregateId: id,
      payload: { profileId: id, userId },
      correlationId: corrId,
    });

    await this.auditService.record({
      userId,
      action: 'profile.verification_requested',
      entityType: 'profile',
      entityId: id,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile verification requested',
      { profileId: id, correlationId: corrId },
      'ProfileService',
    );

    return { message: 'Verification request submitted' };
  }
}
