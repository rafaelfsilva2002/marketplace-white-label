import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { PricingService } from './services/pricing.service';
import { PricingController } from './controllers/pricing.controller';

@Module({
  controllers: [PricingController],
  providers: [
    DatabaseProvider,
    PricingService,
  ],
  exports: [PricingService],
})
export class PricingModule {}
