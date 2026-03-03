import { Injectable, Inject } from '@nestjs/common';
import { sql, and, eq, desc } from 'drizzle-orm';
import { profiles, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import type { PaginatedResult } from '@marketplace/shared';

export interface GeoSearchParams {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  page?: number;
  limit?: number;
  services?: string[];
}

export interface GeoSearchResult {
  profile: typeof profiles.$inferSelect;
  distanceMeters: number;
}

@Injectable()
export class GeoSearchService {
  private readonly logger = new StructuredLogger('GeoSearchService');
  private static readonly DEFAULT_RADIUS_METERS = 10_000;
  private static readonly MAX_RADIUS_METERS = 100_000;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async searchNearby(
    params: GeoSearchParams,
  ): Promise<PaginatedResult<GeoSearchResult>> {
    const correlationId = getCorrelationId();
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;
    const radius = Math.min(
      params.radiusMeters ?? GeoSearchService.DEFAULT_RADIUS_METERS,
      GeoSearchService.MAX_RADIUS_METERS,
    );

    const userPoint = sql`ST_MakePoint(${params.longitude}, ${params.latitude})::geography`;
    const profileLocation = sql`${profiles.location}::geography`;

    const distanceExpr = sql<number>`ST_Distance(${profileLocation}, ${userPoint})`;
    const withinExpr = sql`ST_DWithin(${profileLocation}, ${userPoint}, ${radius})`;

    const conditions = [
      eq(profiles.isActive, true),
      sql`${profiles.location} IS NOT NULL`,
      withinExpr,
    ];

    if (params.services && params.services.length > 0) {
      conditions.push(
        sql`${profiles.services} && ${params.services}::text[]`,
      );
    }

    const whereClause = and(...conditions);

    const [countResult] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(profiles)
      .where(whereClause);

    const total = countResult?.total ?? 0;

    const rows = await this.db
      .select({
        profile: profiles,
        distanceMeters: distanceExpr,
      })
      .from(profiles)
      .where(whereClause)
      .orderBy(sql`${distanceExpr} asc`)
      .limit(limit)
      .offset(offset);

    const data: GeoSearchResult[] = rows.map((row) => ({
      profile: row.profile,
      distanceMeters: Math.round(Number(row.distanceMeters)),
    }));

    this.logger.logWithData(
      'info',
      'Geo search executed',
      {
        latitude: params.latitude,
        longitude: params.longitude,
        radiusMeters: radius,
        resultsCount: data.length,
        total,
        page,
        correlationId,
      },
      'GeoSearchService',
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
