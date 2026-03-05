import { Module } from '@nestjs/common';
import { NotificationController } from './controllers/notification.controller';
import { NotificationGateway } from './gateways/notification.gateway';
import { EmailService } from './services/email.service';
import { PushNotificationService } from './services/push-notification.service';
import { DatabaseProvider } from '@/config/database.config';

@Module({
  controllers: [NotificationController],
  providers: [DatabaseProvider, NotificationGateway, EmailService, PushNotificationService],
  exports: [NotificationGateway, EmailService, PushNotificationService],
})
export class NotificationsModule {}
