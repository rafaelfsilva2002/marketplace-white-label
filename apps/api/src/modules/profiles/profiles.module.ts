import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { ProfileService } from './services/profile.service';
import { ProfileViewsService } from './services/profile-views.service';
import { ProfileController } from './controllers/profile.controller';

@Module({
  imports: [UploadsModule],
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
