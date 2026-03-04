import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { ApiResponse } from '@marketplace/shared';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { ProfileService } from '../services/profile.service';
import { ProfileViewsService } from '../services/profile-views.service';
import { CreateProfileDto } from '../dto/create-profile.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';

@Controller('profiles')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly profileViewsService: ProfileViewsService,
  ) {}

  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('city') city?: string,
    @Query('state') state?: string,
  ) {
    return this.profileService.findAll(page, limit, city, state);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProfileDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { correlationId?: string },
  ) {
    return this.profileService.create(dto, req.correlationId);
  }

  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: {
      headers: Record<string, string | undefined>;
      ip?: string;
      user?: JwtUser;
    },
  ) {
    const profile = await this.profileService.findById(id);

    await this.profileViewsService.recordView({
      profileId: id,
      viewerId: req.user?.id,
      ipAddress: req.headers['x-forwarded-for'] ?? req.ip,
      userAgent: req.headers['user-agent'],
      source: 'api',
    });

    return profile;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { correlationId?: string },
  ) {
    return this.profileService.update(id, dto, user.id, req.correlationId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: { correlationId?: string },
  ) {
    await this.profileService.softDelete(id, user.id, req.correlationId);
  }

  @Delete(':id/photos/:photoIndex')
  @UseGuards(JwtAuthGuard)
  async removePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoIndex', ParseIntPipe) photoIndex: number,
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string; photos: string[] }>> {
    const result = await this.profileService.removePhoto(
      id,
      photoIndex,
      user.id,
      headerCorrelationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/views')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getViewStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.profileViewsService.getViewStats(id);
  }
}
