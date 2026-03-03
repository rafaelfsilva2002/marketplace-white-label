import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { AIGatewayProvider } from '@/config/ai-gateway.config';
import { SearchService } from './services/search.service';
import { GeoSearchService } from './services/geo-search.service';
import { SemanticSearchService } from './services/semantic-search.service';
import { SearchController } from './controllers/search.controller';

@Module({
  controllers: [SearchController],
  providers: [
    DatabaseProvider,
    AIGatewayProvider,
    SearchService,
    GeoSearchService,
    SemanticSearchService,
  ],
  exports: [SearchService, GeoSearchService, SemanticSearchService],
})
export class SearchModule {}
