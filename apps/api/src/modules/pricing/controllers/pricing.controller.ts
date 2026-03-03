import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@marketplace/shared';
import { PricingService } from '../services/pricing.service';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('suggest/:profileId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Professional, UserRole.Admin)
  async suggestPlan(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.pricingService.suggestPlan(profileId);
  }

  @Get('analytics/:profileId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Professional, UserRole.Admin)
  async getAnalytics(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.pricingService.getAnalytics(profileId);
  }
}
