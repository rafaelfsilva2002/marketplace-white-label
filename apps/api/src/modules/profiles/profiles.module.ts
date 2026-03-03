import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { ProfileService } from './services/profile.service';
import { ProfileViewsService } from './services/profile-views.service';
import { ProfileController } from './controllers/profile.controller';

@Module({
  controllers: [ProfileController],
  providers: [
    DatabaseProvider,
    OutboxService,
    ProfileService,
    ProfileViewsService,
  ],
  exports: [ProfileService, ProfileViewsService],
})
export class ProfilesModule {}
