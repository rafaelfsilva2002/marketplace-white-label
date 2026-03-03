import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { ReviewService } from './services/review.service';
import { ReviewController } from './controllers/review.controller';

@Module({
  controllers: [ReviewController],
  providers: [
    DatabaseProvider,
    OutboxService,
    ReviewService,
  ],
  exports: [ReviewService],
})
export class ReviewsModule {}
