import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, count, sum, sql, desc, and, isNull } from 'drizzle-orm';
import {
  type Database,
  users,
  profiles,
  subscriptions,
  ledgerEntries,
  moderationQueue,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { AuditService } from '@/modules/audit/audit.service';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';

export interface PlatformStats {
  totalUsers: number;
  activeProfiles: number;
  pendingModerationItems: number;
  totalGmv: number;
  activeSubscriptions: number;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  isVerified: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  profile: {
    id: string;
    displayName: string;
    bio: string | null;
    city: string | null;
    state: string | null;
    isVerified: boolean;
    isActive: boolean;
    viewsCount: number;
    createdAt: Date;
  } | null;
}

export interface PaginatedUsers {
  data: UserListItem[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new StructuredLogger('AdminService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly auditService: AuditService,
  ) {}

  async getPlatformStats(): Promise<PlatformStats> {
    const correlationId = getCorrelationId();

    const [usersCount] = await this.db
      .select({ value: count() })
      .from(users)
      .where(isNull(users.deletedAt));

    const [profilesCount] = await this.db
      .select({ value: count() })
      .from(profiles)
      .where(eq(profiles.isActive, true));

    const [moderationCount] = await this.db
      .select({ value: count() })
      .from(moderationQueue)
      .where(eq(moderationQueue.status, 'pending'));

    const [gmvResult] = await this.db
      .select({ value: sum(ledgerEntries.amount) })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.type, 'credit'));

    const [subsCount] = await this.db
      .select({ value: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    const stats: PlatformStats = {
      totalUsers: usersCount.value,
      activeProfiles: profilesCount.value,
      pendingModerationItems: moderationCount.value,
      totalGmv: Number(gmvResult.value ?? 0),
      activeSubscriptions: subsCount.value,
    };

    this.logger.logWithData(
      'info',
      'Platform stats fetched',
      { ...stats, correlationId },
      'AdminService',
    );

    return stats;
  }

  async getUsers(
    limit: number = 20,
    offset: number = 0,
    role?: string,
  ): Promise<PaginatedUsers> {
    const correlationId = getCorrelationId();

    const conditions = [isNull(users.deletedAt)];
    if (role) {
      conditions.push(sql`${users.role} = ${role}`);
    }

    const whereClause =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const [totalResult] = await this.db
      .select({ value: count() })
      .from(users)
      .where(whereClause);

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    this.logger.logWithData(
      'info',
      'Users list fetched',
      { total: totalResult.value, limit, offset, role: role ?? 'all', correlationId },
      'AdminService',
    );

    return {
      data: rows,
      total: totalResult.value,
      limit,
      offset,
    };
  }

  async getUserById(id: string): Promise<UserDetail> {
    const correlationId = getCorrelationId();

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const [profile] = await this.db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        bio: profiles.bio,
        city: profiles.city,
        state: profiles.state,
        isVerified: profiles.isVerified,
        isActive: profiles.isActive,
        viewsCount: profiles.viewsCount,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(eq(profiles.userId, id))
      .limit(1);

    this.logger.logWithData(
      'info',
      'User detail fetched',
      { userId: id, hasProfile: !!profile, correlationId },
      'AdminService',
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      profile: profile ?? null,
    };
  }

  async updateUserRole(
    userId: string,
    newRole: string,
    adminId: string,
  ): Promise<UserListItem> {
    const correlationId = getCorrelationId();

    const validRoles = ['admin', 'moderator', 'professional', 'user'];
    if (!validRoles.includes(newRole)) {
      throw new BadRequestException(
        `Invalid role: ${newRole}. Valid roles: ${validRoles.join(', ')}`,
      );
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const oldRole = user.role;

    const [updated] = await this.db
      .update(users)
      .set({
        role: newRole as 'admin' | 'moderator' | 'professional' | 'user',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    await this.auditService.record({
      userId: adminId,
      action: 'user.role.updated',
      entityType: 'user',
      entityId: userId,
      oldValue: { role: oldRole },
      newValue: { role: newRole },
      correlationId,
    });

    this.logger.logWithData(
      'info',
      'User role updated',
      { userId, oldRole, newRole, adminId, correlationId },
      'AdminService',
    );

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      isVerified: updated.isVerified,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      deletedAt: updated.deletedAt,
    };
  }

  async deactivateUser(
    userId: string,
    adminId: string,
  ): Promise<{ success: boolean; userId: string }> {
    const correlationId = getCorrelationId();

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${userId} is already deactivated`);
    }

    const now = new Date();

    await this.db
      .update(users)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // Also deactivate the profile if it exists
    await this.db
      .update(profiles)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(eq(profiles.userId, userId));

    await this.auditService.record({
      userId: adminId,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: userId,
      oldValue: { deletedAt: null },
      newValue: { deletedAt: now.toISOString() },
      correlationId,
    });

    this.logger.logWithData(
      'info',
      'User deactivated',
      { userId, adminId, correlationId },
      'AdminService',
    );

    return { success: true, userId };
  }
}
