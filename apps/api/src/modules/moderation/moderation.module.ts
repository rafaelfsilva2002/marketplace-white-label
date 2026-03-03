import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { ModerationService } from './services/moderation.service';
import { ModerationController } from './controllers/moderation.controller';

@Module({
  controllers: [ModerationController],
  providers: [
    DatabaseProvider,
    ModerationService,
  ],
  exports: [ModerationService],
})
export class ModerationModule {}
