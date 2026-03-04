import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [DatabaseProvider],
})
export class HealthModule {}
