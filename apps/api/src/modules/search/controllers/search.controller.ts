import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { ClampPipe } from '@/common/pipes/clamp.pipe';
import { SearchService } from '../services/search.service';
import { GeoSearchService } from '../services/geo-search.service';
import { SemanticSearchService } from '../services/semantic-search.service';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly geoSearchService: GeoSearchService,
    private readonly semanticSearchService: SemanticSearchService,
  ) {}

  @Get()
  async fullTextSearch(
    @Query('q') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe, new ClampPipe(1, Infinity)) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe, new ClampPipe(1, 100)) limit: number,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('services') servicesRaw?: string,
    @Query('minPrice') minPriceRaw?: string,
    @Query('maxPrice') maxPriceRaw?: string,
  ) {
    if (!query || !query.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }

    const services = servicesRaw
      ? servicesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const minPrice = minPriceRaw ? parseFloat(minPriceRaw) : undefined;
    const maxPrice = maxPriceRaw ? parseFloat(maxPriceRaw) : undefined;

    return this.searchService.fullTextSearch({
      query,
      page,
      limit,
      city,
      state,
      services,
      minPrice,
      maxPrice,
    });
  }

  @Get('suggest')
  async autocomplete(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe, new ClampPipe(1, 100)) limit: number,
  ) {
    if (!query || !query.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }

    return this.searchService.autocomplete(query, limit);
  }

  @Get('nearby')
  async geoSearch(
    @Query('lat') latRaw: string,
    @Query('lng') lngRaw: string,
    @Query('radius', new DefaultValuePipe(10000), ParseIntPipe) radiusMeters: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe, new ClampPipe(1, Infinity)) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe, new ClampPipe(1, 100)) limit: number,
    @Query('services') servicesRaw?: string,
  ) {
    if (!latRaw || !lngRaw) {
      throw new BadRequestException(
        'Query parameters "lat" and "lng" are required',
      );
    }

    const latitude = parseFloat(latRaw);
    const longitude = parseFloat(lngRaw);

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new BadRequestException(
        'Parameters "lat" and "lng" must be valid numbers',
      );
    }

    if (latitude < -90 || latitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }

    if (longitude < -180 || longitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }

    const services = servicesRaw
      ? servicesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    return this.geoSearchService.searchNearby({
      latitude,
      longitude,
      radiusMeters,
      page,
      limit,
      services,
    });
  }

  @Post('semantic')
  async semanticSearch(
    @Body() body: {
      query: string;
      city?: string;
      state?: string;
      limit?: number;
    },
  ) {
    if (!body.query || !body.query.trim()) {
      throw new BadRequestException('Field "query" is required');
    }

    const limit = Math.min(100, Math.max(1, body.limit ?? 20));

    const results = await this.semanticSearchService.search(body.query, {
      city: body.city,
      state: body.state,
      limit,
    });

    return {
      results: results.map((r) => r.profile),
      meta: {
        query: body.query,
        mode: 'semantic' as const,
        count: results.length,
        similarities: results.map((r) => r.similarity),
      },
    };
  }
}
