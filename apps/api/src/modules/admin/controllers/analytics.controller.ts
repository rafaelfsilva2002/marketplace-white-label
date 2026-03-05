import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole, ApiResponse } from '@marketplace/shared';
import {
  AnalyticsService,
  AnalyticsPeriod,
  RevenueAnalytics,
  UserGrowthAnalytics,
  ProfileAnalytics,
  SearchAnalytics,
  CategoryAnalytics,
  ModerationAnalytics,
  OverviewDashboard,
} from '../services/analytics.service';

function parsePeriod(value?: string): AnalyticsPeriod {
  if (value === '7d' || value === '30d' || value === '90d') return value;
  return '30d';
}

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(): Promise<ApiResponse<OverviewDashboard>> {
    const data = await this.analyticsService.getOverviewDashboard();
    return { success: true, data };
  }

  @Get('revenue')
  async getRevenue(
    @Query('period') period?: string,
  ): Promise<ApiResponse<RevenueAnalytics>> {
    const data = await this.analyticsService.getRevenueAnalytics(
      parsePeriod(period),
    );
    return { success: true, data };
  }

  @Get('users')
  async getUserGrowth(
    @Query('period') period?: string,
  ): Promise<ApiResponse<UserGrowthAnalytics>> {
    const data = await this.analyticsService.getUserGrowth(
      parsePeriod(period),
    );
    return { success: true, data };
  }

  @Get('profiles')
  async getProfiles(
    @Query('period') period?: string,
  ): Promise<ApiResponse<ProfileAnalytics>> {
    const data = await this.analyticsService.getProfileAnalytics(
      parsePeriod(period),
    );
    return { success: true, data };
  }

  @Get('search')
  async getSearch(
    @Query('period') period?: string,
  ): Promise<ApiResponse<SearchAnalytics>> {
    const data = await this.analyticsService.getSearchAnalytics(
      parsePeriod(period),
    );
    return { success: true, data };
  }

  @Get('categories')
  async getCategories(): Promise<ApiResponse<CategoryAnalytics>> {
    const data = await this.analyticsService.getCategoryAnalytics();
    return { success: true, data };
  }

  @Get('moderation')
  async getModeration(
    @Query('period') period?: string,
  ): Promise<ApiResponse<ModerationAnalytics>> {
    const data = await this.analyticsService.getModerationAnalytics(
      parsePeriod(period),
    );
    return { success: true, data };
  }
}
