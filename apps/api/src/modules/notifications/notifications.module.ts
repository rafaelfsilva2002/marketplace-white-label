import { Module } from '@nestjs/common';
import { NotificationGateway } from './gateways/notification.gateway';
import { EmailService } from './services/email.service';

@Module({
  providers: [NotificationGateway, EmailService],
  exports: [NotificationGateway, EmailService],
})
export class NotificationsModule {}
