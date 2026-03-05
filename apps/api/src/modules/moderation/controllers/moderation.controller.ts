import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Headers,
} from '@nestjs/common';
import { ClampPipe } from '@/common/pipes/clamp.pipe';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@marketplace/shared';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { ModerationService } from '../services/moderation.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';

class ModerationActionDto {
  type: 'profile' | 'review';
  reason?: string;
}

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  async getQueue(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe, new ClampPipe(1, Infinity)) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe, new ClampPipe(1, 100)) limit: number,
    @Query('type') type?: 'profile' | 'review',
  ) {
    return this.moderationService.getQueue(page, limit, type);
  }

  @Post('queue/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { correlationId?: string },
  ) {
    return this.moderationService.approve(
      id,
      dto.type,
      user.id,
      req.correlationId,
    );
  }

  @Post('queue/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { correlationId?: string },
  ) {
    return this.moderationService.reject(
      id,
      dto.type,
      user.id,
      dto.reason,
      req.correlationId,
    );
  }

  @Post('reports')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createReport(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ) {
    return this.moderationService.createReport(
      user.id,
      dto,
      headerCorrelationId,
    );
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  async getReports(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe, new ClampPipe(1, Infinity)) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe, new ClampPipe(1, 100)) limit: number,
    @Query('status') status?: string,
  ) {
    return this.moderationService.getReports(status, page, limit);
  }

  @Post('reports/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ) {
    return this.moderationService.resolveReport(
      id,
      user.id,
      dto,
      headerCorrelationId,
    );
  }
}
