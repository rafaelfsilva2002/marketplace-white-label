import { Module } from '@nestjs/common';
import { NotificationController } from './controllers/notification.controller';
import { NotificationGateway } from './gateways/notification.gateway';
import { EmailService } from './services/email.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationGateway, EmailService],
  exports: [NotificationGateway, EmailService],
})
export class NotificationsModule {}
