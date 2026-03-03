import {
  Body,
  Controller,
  Delete,
  Get,
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

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

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
  async cancel(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionService.cancelSubscription(id, user.id);
  }
}
