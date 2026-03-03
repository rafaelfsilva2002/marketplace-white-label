import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import {
  experiments,
  experimentVariants,
  experimentResults,
  type Database,
  type ExperimentVariantConfig,
  type ExperimentMetrics,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';

export interface CreateVariantInput {
  name: string;
  weight: number;
  config: ExperimentVariantConfig;
}

export interface AggregatedVariantResult {
  variantId: string;
  variantName: string;
  sampleSize: number;
  avgLatencyMs: number | null;
  avgCostUsd: number | null;
  avgQualityScore: number | null;
  avgUserRating: number | null;
}

export interface ExperimentResults {
  experimentId: string;
  experimentName: string;
  status: string;
  variants: AggregatedVariantResult[];
  winner: AggregatedVariantResult | null;
}

@Injectable()
export class ExperimentService {
  private readonly logger = new StructuredLogger('ExperimentService');

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async createExperiment(
    name: string,
    description: string | undefined,
    variants: CreateVariantInput[],
    correlationId: string,
  ) {
    if (!variants || variants.length < 2) {
      throw new BadRequestException(
        'At least 2 variants are required for an experiment',
      );
    }

    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      throw new BadRequestException(
        `Variant weights must sum to 100, got ${totalWeight}`,
      );
    }

    const [experiment] = await this.db
      .insert(experiments)
      .values({
        name,
        description,
        status: 'draft',
        metadata: { correlationId },
      })
      .returning();

    const variantRecords = await this.db
      .insert(experimentVariants)
      .values(
        variants.map((v) => ({
          experimentId: experiment.id,
          name: v.name,
          weight: v.weight,
          config: v.config,
        })),
      )
      .returning();

    this.logger.logWithData(
      'info',
      'Experiment created',
      {
        experimentId: experiment.id,
        name,
        variantCount: variantRecords.length,
        correlationId,
      },
      'ExperimentService',
    );

    return {
      ...experiment,
      variants: variantRecords,
    };
  }

  async startExperiment(id: string, correlationId: string) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id))
      .limit(1);

    if (!experiment) {
      throw new NotFoundException(`Experiment "${id}" not found`);
    }

    if (experiment.status !== 'draft') {
      throw new BadRequestException(
        `Experiment cannot be started from status "${experiment.status}"`,
      );
    }

    const [updated] = await this.db
      .update(experiments)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, id))
      .returning();

    this.logger.logWithData(
      'info',
      'Experiment started',
      { experimentId: id, correlationId },
      'ExperimentService',
    );

    return updated;
  }

  async assignVariant(
    experimentId: string,
    userId: string,
  ): Promise<typeof experimentVariants.$inferSelect> {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(
        and(
          eq(experiments.id, experimentId),
          eq(experiments.status, 'running'),
        ),
      )
      .limit(1);

    if (!experiment) {
      throw new NotFoundException(
        `Running experiment "${experimentId}" not found`,
      );
    }

    const variants = await this.db
      .select()
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, experimentId));

    if (variants.length === 0) {
      throw new BadRequestException(
        `Experiment "${experimentId}" has no variants`,
      );
    }

    // Deterministic assignment based on userId hash for consistency
    // Same user always gets the same variant for the same experiment
    const hash = this.hashString(`${experimentId}:${userId}`);
    const normalizedHash = hash % 100;

    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (normalizedHash < cumulativeWeight) {
        return variant;
      }
    }

    // Fallback: return last variant (should not normally reach here)
    return variants[variants.length - 1];
  }

  async recordResult(
    experimentId: string,
    variantId: string,
    userId: string | undefined,
    metrics: ExperimentMetrics,
    correlationId: string,
  ) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId))
      .limit(1);

    if (!experiment) {
      throw new NotFoundException(`Experiment "${experimentId}" not found`);
    }

    const [variant] = await this.db
      .select()
      .from(experimentVariants)
      .where(
        and(
          eq(experimentVariants.id, variantId),
          eq(experimentVariants.experimentId, experimentId),
        ),
      )
      .limit(1);

    if (!variant) {
      throw new NotFoundException(
        `Variant "${variantId}" not found in experiment "${experimentId}"`,
      );
    }

    const [result] = await this.db
      .insert(experimentResults)
      .values({
        experimentId,
        variantId,
        userId,
        correlationId,
        metrics,
      })
      .returning();

    return result;
  }

  async getResults(experimentId: string): Promise<ExperimentResults> {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId))
      .limit(1);

    if (!experiment) {
      throw new NotFoundException(`Experiment "${experimentId}" not found`);
    }

    const variants = await this.db
      .select()
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, experimentId));

    const aggregatedVariants: AggregatedVariantResult[] = [];

    for (const variant of variants) {
      const results = await this.db
        .select({
          sampleSize: sql<number>`count(*)::int`,
          avgLatencyMs: sql<number>`avg((${experimentResults.metrics}->>'latency_ms')::numeric)`,
          avgCostUsd: sql<number>`avg((${experimentResults.metrics}->>'cost_usd')::numeric)`,
          avgQualityScore: sql<number>`avg((${experimentResults.metrics}->>'quality_score')::numeric)`,
          avgUserRating: sql<number>`avg((${experimentResults.metrics}->>'user_rating')::numeric)`,
        })
        .from(experimentResults)
        .where(
          and(
            eq(experimentResults.experimentId, experimentId),
            eq(experimentResults.variantId, variant.id),
          ),
        );

      const row = results[0];
      aggregatedVariants.push({
        variantId: variant.id,
        variantName: variant.name,
        sampleSize: row?.sampleSize ?? 0,
        avgLatencyMs: row?.avgLatencyMs ?? null,
        avgCostUsd: row?.avgCostUsd ?? null,
        avgQualityScore: row?.avgQualityScore ?? null,
        avgUserRating: row?.avgUserRating ?? null,
      });
    }

    // Determine winner: variant with highest quality score (if available),
    // otherwise lowest cost, otherwise lowest latency
    const winner = this.determineWinner(aggregatedVariants);

    return {
      experimentId,
      experimentName: experiment.name,
      status: experiment.status,
      variants: aggregatedVariants,
      winner,
    };
  }

  async endExperiment(id: string, correlationId: string) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id))
      .limit(1);

    if (!experiment) {
      throw new NotFoundException(`Experiment "${id}" not found`);
    }

    if (experiment.status !== 'running') {
      throw new BadRequestException(
        `Experiment cannot be ended from status "${experiment.status}"`,
      );
    }

    const results = await this.getResults(id);

    const [updated] = await this.db
      .update(experiments)
      .set({
        status: 'completed',
        endedAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(experiment.metadata as Record<string, unknown> | null),
          winnerId: results.winner?.variantId ?? null,
          winnerName: results.winner?.variantName ?? null,
          correlationId,
        },
      })
      .where(eq(experiments.id, id))
      .returning();

    this.logger.logWithData(
      'info',
      'Experiment ended',
      {
        experimentId: id,
        winnerId: results.winner?.variantId ?? null,
        winnerName: results.winner?.variantName ?? null,
        correlationId,
      },
      'ExperimentService',
    );

    return {
      ...updated,
      results,
    };
  }

  async getExperiment(id: string) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id))
      .limit(1);

    if (!experiment) {
      throw new NotFoundException(`Experiment "${id}" not found`);
    }

    const variants = await this.db
      .select()
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, id));

    return {
      ...experiment,
      variants,
    };
  }

  private determineWinner(
    variants: AggregatedVariantResult[],
  ): AggregatedVariantResult | null {
    const withSamples = variants.filter((v) => v.sampleSize > 0);

    if (withSamples.length === 0) {
      return null;
    }

    // Prefer quality score, then cost (lower is better), then latency (lower is better)
    const withQuality = withSamples.filter(
      (v) => v.avgQualityScore !== null,
    );
    if (withQuality.length > 0) {
      return withQuality.reduce((best, current) =>
        (current.avgQualityScore ?? 0) > (best.avgQualityScore ?? 0)
          ? current
          : best,
      );
    }

    const withCost = withSamples.filter((v) => v.avgCostUsd !== null);
    if (withCost.length > 0) {
      return withCost.reduce((best, current) =>
        (current.avgCostUsd ?? Infinity) < (best.avgCostUsd ?? Infinity)
          ? current
          : best,
      );
    }

    const withLatency = withSamples.filter(
      (v) => v.avgLatencyMs !== null,
    );
    if (withLatency.length > 0) {
      return withLatency.reduce((best, current) =>
        (current.avgLatencyMs ?? Infinity) < (best.avgLatencyMs ?? Infinity)
          ? current
          : best,
      );
    }

    // Fallback: variant with most samples
    return withSamples.reduce((best, current) =>
      current.sampleSize > best.sampleSize ? current : best,
    );
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
