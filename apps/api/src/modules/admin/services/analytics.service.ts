import { Injectable, Inject } from '@nestjs/common';
import { eq, count, sum, sql, desc, and, gte, isNull } from 'drizzle-orm';
import {
  type Database,
  users,
  profiles,
  profileViews,
  ledgerEntries,
  moderationQueue,
  auditLogs,
  categories,
  profileCategories,
  subscriptions,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';

/* ---------- Types ---------- */

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export interface DailyDataPoint {
  date: string;
  value: number;
}

export interface RevenueAnalytics {
  period: AnalyticsPeriod;
  totalRevenue: number;
  dailyRevenue: DailyDataPoint[];
  averageDailyRevenue: number;
  growthPercent: number;
  transactionCount: number;
}

export interface UserGrowthAnalytics {
  period: AnalyticsPeriod;
  totalNewUsers: number;
  dailyNewUsers: DailyDataPoint[];
  growthPercent: number;
  totalUsers: number;
}

export interface ProfileAnalytics {
  period: AnalyticsPeriod;
  newProfiles: number;
  dailyNewProfiles: DailyDataPoint[];
  topViewed: Array<{ id: string; displayName: string; viewsCount: number }>;
  averageViews: number;
  totalActiveProfiles: number;
}

export interface SearchAnalytics {
  period: AnalyticsPeriod;
  totalSearches: number;
  topSearchTerms: Array<{ term: string; count: number }>;
  dailySearches: DailyDataPoint[];
}

export interface CategoryAnalytics {
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    profileCount: number;
  }>;
  totalCategories: number;
}

export interface ModerationAnalytics {
  period: AnalyticsPeriod;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  escalatedCount: number;
  approvalRate: number;
  dailyItems: DailyDataPoint[];
  averageResolutionHours: number;
}

export interface OverviewDashboard {
  revenue: {
    total: number;
    growthPercent: number;
  };
  users: {
    total: number;
    newThisPeriod: number;
    growthPercent: number;
  };
  profiles: {
    active: number;
    newThisPeriod: number;
  };
  moderation: {
    pending: number;
    approvalRate: number;
  };
  subscriptions: {
    active: number;
  };
  topCategories: Array<{ name: string; profileCount: number }>;
}

/* ---------- Service ---------- */

@Injectable()
export class AnalyticsService {
  private readonly logger = new StructuredLogger('AnalyticsService');

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  /* ---------- Helpers ---------- */

  private getPeriodDays(period: AnalyticsPeriod): number {
    switch (period) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
    }
  }

  private getStartDate(period: AnalyticsPeriod): Date {
    const days = this.getPeriodDays(period);
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private getPreviousPeriodStart(period: AnalyticsPeriod): Date {
    const days = this.getPeriodDays(period);
    const start = new Date();
    start.setDate(start.getDate() - days * 2);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 10) / 10;
  }

  /* ---------- Revenue ---------- */

  async getRevenueAnalytics(
    period: AnalyticsPeriod,
  ): Promise<RevenueAnalytics> {
    const correlationId = getCorrelationId();
    const startDate = this.getStartDate(period);
    const prevStartDate = this.getPreviousPeriodStart(period);

    // Current period revenue
    const dailyRows = await this.db
      .select({
        date: sql<string>`DATE(${ledgerEntries.createdAt})`.as('date'),
        value: sum(ledgerEntries.amount).as('value'),
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.type, 'credit'),
          gte(ledgerEntries.createdAt, startDate),
        ),
      )
      .groupBy(sql`DATE(${ledgerEntries.createdAt})`)
      .orderBy(sql`DATE(${ledgerEntries.createdAt})`);

    const dailyRevenue: DailyDataPoint[] = dailyRows.map((r) => ({
      date: String(r.date),
      value: Number(r.value ?? 0),
    }));

    const totalRevenue = dailyRevenue.reduce((s, d) => s + d.value, 0);
    const days = this.getPeriodDays(period);
    const averageDailyRevenue = days > 0 ? Math.round(totalRevenue / days) : 0;

    // Previous period revenue for growth
    const [prevResult] = await this.db
      .select({ value: sum(ledgerEntries.amount) })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.type, 'credit'),
          gte(ledgerEntries.createdAt, prevStartDate),
          sql`${ledgerEntries.createdAt} < ${startDate}`,
        ),
      );
    const prevRevenue = Number(prevResult?.value ?? 0);

    // Transaction count
    const [txCountResult] = await this.db
      .select({ value: count() })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.type, 'credit'),
          gte(ledgerEntries.createdAt, startDate),
        ),
      );

    this.logger.logWithData(
      'info',
      'Revenue analytics fetched',
      { period, totalRevenue, correlationId },
      'AnalyticsService',
    );

    return {
      period,
      totalRevenue,
      dailyRevenue,
      averageDailyRevenue,
      growthPercent: this.calculateGrowth(totalRevenue, prevRevenue),
      transactionCount: txCountResult.value,
    };
  }

  /* ---------- User Growth ---------- */

  async getUserGrowth(period: AnalyticsPeriod): Promise<UserGrowthAnalytics> {
    const correlationId = getCorrelationId();
    const startDate = this.getStartDate(period);
    const prevStartDate = this.getPreviousPeriodStart(period);

    // Daily new users
    const dailyRows = await this.db
      .select({
        date: sql<string>`DATE(${users.createdAt})`.as('date'),
        value: count().as('value'),
      })
      .from(users)
      .where(
        and(isNull(users.deletedAt), gte(users.createdAt, startDate)),
      )
      .groupBy(sql`DATE(${users.createdAt})`)
      .orderBy(sql`DATE(${users.createdAt})`);

    const dailyNewUsers: DailyDataPoint[] = dailyRows.map((r) => ({
      date: String(r.date),
      value: Number(r.value),
    }));

    const totalNewUsers = dailyNewUsers.reduce((s, d) => s + d.value, 0);

    // Previous period for growth
    const [prevResult] = await this.db
      .select({ value: count() })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          gte(users.createdAt, prevStartDate),
          sql`${users.createdAt} < ${startDate}`,
        ),
      );
    const prevNewUsers = Number(prevResult?.value ?? 0);

    // Total users
    const [totalResult] = await this.db
      .select({ value: count() })
      .from(users)
      .where(isNull(users.deletedAt));

    this.logger.logWithData(
      'info',
      'User growth analytics fetched',
      { period, totalNewUsers, correlationId },
      'AnalyticsService',
    );

    return {
      period,
      totalNewUsers,
      dailyNewUsers,
      growthPercent: this.calculateGrowth(totalNewUsers, prevNewUsers),
      totalUsers: totalResult.value,
    };
  }

  /* ---------- Profile Analytics ---------- */

  async getProfileAnalytics(
    period: AnalyticsPeriod,
  ): Promise<ProfileAnalytics> {
    const correlationId = getCorrelationId();
    const startDate = this.getStartDate(period);

    // Daily new profiles
    const dailyRows = await this.db
      .select({
        date: sql<string>`DATE(${profiles.createdAt})`.as('date'),
        value: count().as('value'),
      })
      .from(profiles)
      .where(gte(profiles.createdAt, startDate))
      .groupBy(sql`DATE(${profiles.createdAt})`)
      .orderBy(sql`DATE(${profiles.createdAt})`);

    const dailyNewProfiles: DailyDataPoint[] = dailyRows.map((r) => ({
      date: String(r.date),
      value: Number(r.value),
    }));

    const newProfiles = dailyNewProfiles.reduce((s, d) => s + d.value, 0);

    // Top viewed profiles
    const topViewed = await this.db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        viewsCount: profiles.viewsCount,
      })
      .from(profiles)
      .where(eq(profiles.isActive, true))
      .orderBy(desc(profiles.viewsCount))
      .limit(10);

    // Average views
    const [avgResult] = await this.db
      .select({
        value: sql<number>`COALESCE(AVG(${profiles.viewsCount}), 0)`.as(
          'value',
        ),
      })
      .from(profiles)
      .where(eq(profiles.isActive, true));

    // Total active profiles
    const [activeCount] = await this.db
      .select({ value: count() })
      .from(profiles)
      .where(eq(profiles.isActive, true));

    this.logger.logWithData(
      'info',
      'Profile analytics fetched',
      { period, newProfiles, correlationId },
      'AnalyticsService',
    );

    return {
      period,
      newProfiles,
      dailyNewProfiles,
      topViewed,
      averageViews: Math.round(Number(avgResult?.value ?? 0)),
      totalActiveProfiles: activeCount.value,
    };
  }

  /* ---------- Search Analytics ---------- */

  async getSearchAnalytics(
    period: AnalyticsPeriod,
  ): Promise<SearchAnalytics> {
    const correlationId = getCorrelationId();
    const startDate = this.getStartDate(period);

    // Search actions from audit logs
    const searchActions = ['search.performed', 'search.semantic', 'search.fts'];

    // Top search terms from audit log metadata
    const termRows = await this.db
      .select({
        term: sql<string>`${auditLogs.newValue}->>'query'`.as('term'),
        count: count().as('count'),
      })
      .from(auditLogs)
      .where(
        and(
          sql`${auditLogs.action} LIKE 'search%'`,
          gte(auditLogs.createdAt, startDate),
          sql`${auditLogs.newValue}->>'query' IS NOT NULL`,
        ),
      )
      .groupBy(sql`${auditLogs.newValue}->>'query'`)
      .orderBy(desc(count()))
      .limit(20);

    const topSearchTerms = termRows.map((r) => ({
      term: String(r.term ?? 'N/A'),
      count: Number(r.count),
    }));

    // Daily search count
    const dailyRows = await this.db
      .select({
        date: sql<string>`DATE(${auditLogs.createdAt})`.as('date'),
        value: count().as('value'),
      })
      .from(auditLogs)
      .where(
        and(
          sql`${auditLogs.action} LIKE 'search%'`,
          gte(auditLogs.createdAt, startDate),
        ),
      )
      .groupBy(sql`DATE(${auditLogs.createdAt})`)
      .orderBy(sql`DATE(${auditLogs.createdAt})`);

    const dailySearches: DailyDataPoint[] = dailyRows.map((r) => ({
      date: String(r.date),
      value: Number(r.value),
    }));

    const totalSearches = dailySearches.reduce((s, d) => s + d.value, 0);

    this.logger.logWithData(
      'info',
      'Search analytics fetched',
      { period, totalSearches, correlationId },
      'AnalyticsService',
    );

    return {
      period,
      totalSearches,
      topSearchTerms,
      dailySearches,
    };
  }

  /* ---------- Category Analytics ---------- */

  async getCategoryAnalytics(): Promise<CategoryAnalytics> {
    const correlationId = getCorrelationId();

    const rows = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        profileCount: count(profileCategories.profileId).as('profileCount'),
      })
      .from(categories)
      .leftJoin(
        profileCategories,
        eq(categories.id, profileCategories.categoryId),
      )
      .where(eq(categories.isActive, true))
      .groupBy(categories.id, categories.name, categories.slug)
      .orderBy(desc(count(profileCategories.profileId)));

    this.logger.logWithData(
      'info',
      'Category analytics fetched',
      { totalCategories: rows.length, correlationId },
      'AnalyticsService',
    );

    return {
      categories: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        profileCount: Number(r.profileCount),
      })),
      totalCategories: rows.length,
    };
  }

  /* ---------- Moderation Analytics ---------- */

  async getModerationAnalytics(
    period: AnalyticsPeriod,
  ): Promise<ModerationAnalytics> {
    const correlationId = getCorrelationId();
    const startDate = this.getStartDate(period);

    // Counts by status
    const statusCounts = await this.db
      .select({
        status: moderationQueue.status,
        count: count().as('count'),
      })
      .from(moderationQueue)
      .where(gte(moderationQueue.createdAt, startDate))
      .groupBy(moderationQueue.status);

    const countMap: Record<string, number> = {};
    for (const row of statusCounts) {
      countMap[row.status] = Number(row.count);
    }

    const pendingCount = countMap['pending'] ?? 0;
    const approvedCount = countMap['approved'] ?? 0;
    const rejectedCount = countMap['rejected'] ?? 0;
    const escalatedCount = countMap['escalated'] ?? 0;
    const totalResolved = approvedCount + rejectedCount;
    const approvalRate =
      totalResolved > 0
        ? Math.round((approvedCount / totalResolved) * 100 * 10) / 10
        : 0;

    // Daily items
    const dailyRows = await this.db
      .select({
        date: sql<string>`DATE(${moderationQueue.createdAt})`.as('date'),
        value: count().as('value'),
      })
      .from(moderationQueue)
      .where(gte(moderationQueue.createdAt, startDate))
      .groupBy(sql`DATE(${moderationQueue.createdAt})`)
      .orderBy(sql`DATE(${moderationQueue.createdAt})`);

    const dailyItems: DailyDataPoint[] = dailyRows.map((r) => ({
      date: String(r.date),
      value: Number(r.value),
    }));

    // Average resolution time (hours) for reviewed items
    const [avgResolution] = await this.db
      .select({
        value: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${moderationQueue.reviewedAt} - ${moderationQueue.createdAt})) / 3600), 0)`.as(
          'value',
        ),
      })
      .from(moderationQueue)
      .where(
        and(
          gte(moderationQueue.createdAt, startDate),
          sql`${moderationQueue.reviewedAt} IS NOT NULL`,
        ),
      );

    this.logger.logWithData(
      'info',
      'Moderation analytics fetched',
      { period, pendingCount, approvalRate, correlationId },
      'AnalyticsService',
    );

    return {
      period,
      pendingCount,
      approvedCount,
      rejectedCount,
      escalatedCount,
      approvalRate,
      dailyItems,
      averageResolutionHours:
        Math.round(Number(avgResolution?.value ?? 0) * 10) / 10,
    };
  }

  /* ---------- Overview Dashboard ---------- */

  async getOverviewDashboard(): Promise<OverviewDashboard> {
    const correlationId = getCorrelationId();
    const period: AnalyticsPeriod = '30d';
    const startDate = this.getStartDate(period);
    const prevStartDate = this.getPreviousPeriodStart(period);

    // Revenue total (current period)
    const [revCurrent] = await this.db
      .select({ value: sum(ledgerEntries.amount) })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.type, 'credit'),
          gte(ledgerEntries.createdAt, startDate),
        ),
      );
    const revenueTotal = Number(revCurrent?.value ?? 0);

    // Revenue previous period
    const [revPrev] = await this.db
      .select({ value: sum(ledgerEntries.amount) })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.type, 'credit'),
          gte(ledgerEntries.createdAt, prevStartDate),
          sql`${ledgerEntries.createdAt} < ${startDate}`,
        ),
      );
    const revenuePrev = Number(revPrev?.value ?? 0);

    // Total users
    const [totalUsersResult] = await this.db
      .select({ value: count() })
      .from(users)
      .where(isNull(users.deletedAt));

    // New users this period
    const [newUsersResult] = await this.db
      .select({ value: count() })
      .from(users)
      .where(
        and(isNull(users.deletedAt), gte(users.createdAt, startDate)),
      );

    // New users previous period
    const [prevUsersResult] = await this.db
      .select({ value: count() })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          gte(users.createdAt, prevStartDate),
          sql`${users.createdAt} < ${startDate}`,
        ),
      );

    // Active profiles
    const [activeProfilesResult] = await this.db
      .select({ value: count() })
      .from(profiles)
      .where(eq(profiles.isActive, true));

    // New profiles this period
    const [newProfilesResult] = await this.db
      .select({ value: count() })
      .from(profiles)
      .where(gte(profiles.createdAt, startDate));

    // Pending moderation
    const [pendingModResult] = await this.db
      .select({ value: count() })
      .from(moderationQueue)
      .where(eq(moderationQueue.status, 'pending'));

    // Moderation approval rate (last 30d)
    const [modApproved] = await this.db
      .select({ value: count() })
      .from(moderationQueue)
      .where(
        and(
          eq(moderationQueue.status, 'approved'),
          gte(moderationQueue.createdAt, startDate),
        ),
      );
    const [modTotal] = await this.db
      .select({ value: count() })
      .from(moderationQueue)
      .where(
        and(
          sql`${moderationQueue.status} IN ('approved', 'rejected')`,
          gte(moderationQueue.createdAt, startDate),
        ),
      );
    const approvalRate =
      modTotal.value > 0
        ? Math.round((modApproved.value / modTotal.value) * 100 * 10) / 10
        : 0;

    // Active subscriptions
    const [subsResult] = await this.db
      .select({ value: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    // Top categories
    const topCatRows = await this.db
      .select({
        name: categories.name,
        profileCount: count(profileCategories.profileId).as('profileCount'),
      })
      .from(categories)
      .leftJoin(
        profileCategories,
        eq(categories.id, profileCategories.categoryId),
      )
      .where(eq(categories.isActive, true))
      .groupBy(categories.id, categories.name)
      .orderBy(desc(count(profileCategories.profileId)))
      .limit(5);

    this.logger.logWithData(
      'info',
      'Overview dashboard fetched',
      { correlationId },
      'AnalyticsService',
    );

    return {
      revenue: {
        total: revenueTotal,
        growthPercent: this.calculateGrowth(revenueTotal, revenuePrev),
      },
      users: {
        total: totalUsersResult.value,
        newThisPeriod: newUsersResult.value,
        growthPercent: this.calculateGrowth(
          newUsersResult.value,
          prevUsersResult.value,
        ),
      },
      profiles: {
        active: activeProfilesResult.value,
        newThisPeriod: newProfilesResult.value,
      },
      moderation: {
        pending: pendingModResult.value,
        approvalRate,
      },
      subscriptions: {
        active: subsResult.value,
      },
      topCategories: topCatRows.map((r) => ({
        name: r.name,
        profileCount: Number(r.profileCount),
      })),
    };
  }
}
