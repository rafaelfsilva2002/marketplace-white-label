import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  controllers: [CategoriesController],
  providers: [DatabaseProvider, CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
