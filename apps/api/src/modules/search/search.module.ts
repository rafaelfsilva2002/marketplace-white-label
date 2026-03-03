import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { SearchService } from './services/search.service';
import { GeoSearchService } from './services/geo-search.service';
import { SearchController } from './controllers/search.controller';

@Module({
  controllers: [SearchController],
  providers: [
    DatabaseProvider,
    SearchService,
    GeoSearchService,
  ],
  exports: [SearchService, GeoSearchService],
})
export class SearchModule {}
