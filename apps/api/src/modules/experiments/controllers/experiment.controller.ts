import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Headers,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole, ApiResponse } from '@marketplace/shared';
import {
  ExperimentService,
  type CreateVariantInput,
  type ExperimentResults,
} from '../services/experiment.service';

class CreateExperimentDto {
  name: string;
  description?: string;
  variants: CreateVariantInput[];
}

class RecordResultDto {
  variantId: string;
  userId?: string;
  metrics: {
    latency_ms?: number;
    cost_usd?: number;
    quality_score?: number;
    user_rating?: number;
    [key: string]: unknown;
  };
}

@Controller('experiments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class ExperimentController {
  private readonly logger = new Logger(ExperimentController.name);

  constructor(private readonly experimentService: ExperimentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createExperiment(
    @Body() dto: CreateExperimentDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Creating experiment',
      name: dto.name,
      variantCount: dto.variants?.length,
      correlationId,
    });

    const result = await this.experimentService.createExperiment(
      dto.name,
      dto.description,
      dto.variants,
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async getExperiment(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<unknown>> {
    const result = await this.experimentService.getExperiment(id);

    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async startExperiment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Starting experiment',
      experimentId: id,
      correlationId,
    });

    const result = await this.experimentService.startExperiment(
      id,
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  async endExperiment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Ending experiment',
      experimentId: id,
      correlationId,
    });

    const result = await this.experimentService.endExperiment(
      id,
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/results')
  async getResults(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<ExperimentResults>> {
    const results = await this.experimentService.getResults(id);

    return {
      success: true,
      data: results,
    };
  }

  @Post(':id/results')
  @HttpCode(HttpStatus.CREATED)
  async recordResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordResultDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<unknown>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    const result = await this.experimentService.recordResult(
      id,
      dto.variantId,
      dto.userId,
      dto.metrics,
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }
}
