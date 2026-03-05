import { Controller, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { NotificationGateway } from '../gateways/notification.gateway';
import { PushNotificationService } from '../services/push-notification.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { UserRole } from '@marketplace/shared';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly gateway: NotificationGateway,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Post('push')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  push(@Body() body: { userId: string; event: string; data: unknown }) {
    this.gateway.sendToUser(body.userId, body.event, body.data);
    return { success: true };
  }

  @Post('push-token')
  @UseGuards(JwtAuthGuard)
  async registerPushToken(
    @CurrentUser() user: JwtUser,
    @Body() body: { token: string; platform: 'ios' | 'android' | 'web' },
  ) {
    await this.pushNotificationService.registerToken(
      user.id,
      body.token,
      body.platform,
    );
    return { success: true, data: null };
  }

  @Delete('push-token')
  @UseGuards(JwtAuthGuard)
  async removePushToken(
    @Body() body: { token: string },
  ) {
    await this.pushNotificationService.removeToken(body.token);
    return { success: true, data: null };
  }
}
