import { Controller, Post, Body } from '@nestjs/common';
import { NotificationGateway } from '../gateways/notification.gateway';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly gateway: NotificationGateway) {}

  @Post('push')
  push(@Body() body: { userId: string; event: string; data: unknown }) {
    this.gateway.sendToUser(body.userId, body.event, body.data);
    return { success: true };
  }
}
