import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { RecommendationService } from '../services/recommendation.service';

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
  ) {}

  @Get('for-you')
  @UseGuards(JwtAuthGuard)
  async getPersonalizedRecommendations(
    @CurrentUser() user: JwtUser,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const clampedLimit = Math.min(Math.max(limit, 1), 50);

    const results = await this.recommendationService.getRecommendations(
      user.id,
      clampedLimit,
    );

    return {
      results: results.map((r) => ({
        profile: r.profile,
        score: r.score,
        similarity: r.similarity,
        reason: r.reason,
      })),
      meta: {
        userId: user.id,
        count: results.length,
        limit: clampedLimit,
      },
    };
  }

  @Get('similar/:profileId')
  async getSimilarProfiles(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const clampedLimit = Math.min(Math.max(limit, 1), 50);

    const results = await this.recommendationService.getSimilarProfiles(
      profileId,
      clampedLimit,
    );

    return {
      results: results.map((r) => ({
        profile: r.profile,
        score: r.score,
        similarity: r.similarity,
        reason: r.reason,
      })),
      meta: {
        profileId,
        count: results.length,
        limit: clampedLimit,
      },
    };
  }
}
