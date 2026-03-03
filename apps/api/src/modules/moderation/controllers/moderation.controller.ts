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
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@marketplace/shared';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { ModerationService } from '../services/moderation.service';

class ModerationActionDto {
  type: 'profile' | 'review';
  reason?: string;
}

@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Moderator, UserRole.Admin)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('queue')
  async getQueue(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: 'profile' | 'review',
  ) {
    return this.moderationService.getQueue(page, limit, type);
  }

  @Post('queue/:id/approve')
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
}
