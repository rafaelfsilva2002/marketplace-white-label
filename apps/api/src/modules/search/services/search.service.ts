import { Injectable, Inject } from '@nestjs/common';
import { sql, and, eq, desc } from 'drizzle-orm';
import { profiles, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import type { PaginatedResult } from '@marketplace/shared';

export interface SearchParams {
  query: string;
  page?: number;
  limit?: number;
  city?: string;
  state?: string;
  services?: string[];
  minPrice?: number;
  maxPrice?: number;
}

export interface SearchResult {
  profile: typeof profiles.$inferSelect;
  rank: number;
}

export interface AutocompleteResult {
  id: string;
  displayName: string;
  city: string | null;
  state: string | null;
  services: string[];
}

@Injectable()
export class SearchService {
  private readonly logger = new StructuredLogger('SearchService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async fullTextSearch(
    params: SearchParams,
  ): Promise<PaginatedResult<SearchResult>> {
    const correlationId = getCorrelationId();
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const sanitizedQuery = params.query.replace(/[^\w\s]/g, ' ').trim();

    if (!sanitizedQuery) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const tsQuery = sanitizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `${term}:*`)
      .join(' & ');

    const searchVector = sql`
      to_tsvector('portuguese',
        coalesce(${profiles.displayName}, '') || ' ' ||
        coalesce(${profiles.bio}, '') || ' ' ||
        coalesce(${profiles.description}, '') || ' ' ||
        coalesce(${profiles.city}, '') || ' ' ||
        coalesce(${profiles.state}, '') || ' ' ||
        array_to_string(${profiles.services}, ' ')
      )
    `;

    const tsQueryExpr = sql`to_tsquery('portuguese', ${tsQuery})`;

    const rankExpr = sql<number>`ts_rank(${searchVector}, ${tsQueryExpr})`;

    const conditions = [
      eq(profiles.isActive, true),
      sql`${searchVector} @@ ${tsQueryExpr}`,
    ];

    if (params.city) {
      conditions.push(eq(profiles.city, params.city));
    }
    if (params.state) {
      conditions.push(eq(profiles.state, params.state));
    }
    if (params.minPrice !== undefined) {
      conditions.push(
        sql`(${profiles.priceRange}->>'min')::numeric >= ${params.minPrice}`,
      );
    }
    if (params.maxPrice !== undefined) {
      conditions.push(
        sql`(${profiles.priceRange}->>'max')::numeric <= ${params.maxPrice}`,
      );
    }
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
        rank: rankExpr,
      })
      .from(profiles)
      .where(whereClause)
      .orderBy(sql`${rankExpr} desc`, desc(profiles.searchScore))
      .limit(limit)
      .offset(offset);

    const data: SearchResult[] = rows.map((row) => ({
      profile: row.profile,
      rank: Number(row.rank),
    }));

    this.logger.logWithData(
      'info',
      'Full-text search executed',
      {
        query: sanitizedQuery,
        resultsCount: data.length,
        total,
        page,
        correlationId,
      },
      'SearchService',
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async autocomplete(
    query: string,
    limit: number = 10,
  ): Promise<AutocompleteResult[]> {
    const correlationId = getCorrelationId();

    const sanitized = query.replace(/[^\w\s]/g, ' ').trim();

    if (!sanitized) {
      return [];
    }

    const tsQuery = sanitized
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `${term}:*`)
      .join(' & ');

    const searchVector = sql`
      to_tsvector('portuguese',
        coalesce(${profiles.displayName}, '') || ' ' ||
        coalesce(${profiles.city}, '') || ' ' ||
        array_to_string(${profiles.services}, ' ')
      )
    `;

    const tsQueryExpr = sql`to_tsquery('portuguese', ${tsQuery})`;
    const rankExpr = sql`ts_rank(${searchVector}, ${tsQueryExpr})`;

    const rows = await this.db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        city: profiles.city,
        state: profiles.state,
        services: profiles.services,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.isActive, true),
          sql`${searchVector} @@ ${tsQueryExpr}`,
        ),
      )
      .orderBy(sql`${rankExpr} desc`)
      .limit(limit);

    this.logger.logWithData(
      'info',
      'Autocomplete search executed',
      {
        query: sanitized,
        resultsCount: rows.length,
        correlationId,
      },
      'SearchService',
    );

    return rows;
  }
}
