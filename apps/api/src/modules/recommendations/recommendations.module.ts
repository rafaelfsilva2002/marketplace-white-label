import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { RecommendationService } from './services/recommendation.service';
import { RecommendationController } from './controllers/recommendation.controller';

@Module({
  controllers: [RecommendationController],
  providers: [
    DatabaseProvider,
    RecommendationService,
  ],
  exports: [RecommendationService],
})
export class RecommendationsModule {}
