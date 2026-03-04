import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { SubscriptionService } from '../services/subscription.service';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { UpgradeSubscriptionDto } from '../dto/upgrade-subscription.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // -------------------------------------------------------------------------
  // Endpoints used by the frontend subscription page
  // -------------------------------------------------------------------------

  @Get('current')
  async getCurrent(@CurrentUser() user: JwtUser) {
    const subscription =
      await this.subscriptionService.getActiveSubscription(user.id);

    if (!subscription) {
      return null;
    }

    return subscription;
  }

  @Post('upgrade')
  async upgrade(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    const active =
      await this.subscriptionService.getActiveSubscription(user.id);

    if (!active) {
      // No active subscription — create one with the requested plan
      return this.subscriptionService.createSubscription(
        user.id,
        user.email,
        dto.planId,
      );
    }

    return this.subscriptionService.upgradeOrDowngrade(
      active.id,
      user.id,
      dto.planId,
    );
  }

  @Post('cancel')
  async cancelCurrent(@CurrentUser() user: JwtUser) {
    const active =
      await this.subscriptionService.getActiveSubscription(user.id);

    if (!active) {
      throw new NotFoundException('No active subscription to cancel');
    }

    return this.subscriptionService.cancelSubscription(active.id, user.id);
  }

  // -------------------------------------------------------------------------
  // CRUD endpoints (by subscription ID)
  // -------------------------------------------------------------------------

  @Post()
  async create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionService.createSubscription(
      user.id,
      user.email,
      dto.planType,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionService.getSubscription(id, user.id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionService.upgradeOrDowngrade(
      id,
      user.id,
      dto.planType,
    );
  }

  @Delete(':id')
  async cancelById(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionService.cancelSubscription(id, user.id);
  }
}
