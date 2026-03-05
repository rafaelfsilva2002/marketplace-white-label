import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClampPipe } from '@/common/pipes/clamp.pipe';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole, ApiResponse } from '@marketplace/shared';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { AdminService } from '../services/admin.service';
import { VerifyUserDto } from '../dto/verify-user.dto';

class UpdateRoleDto {
  role!: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('users')
  async getUsers(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe, new ClampPipe(1, 100)) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe, new ClampPipe(0, Infinity)) offset: number,
    @Query('role') role?: string,
  ) {
    return this.adminService.getUsers(limit, offset, role);
  }

  @Get('users/:id')
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id/role')
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() admin: JwtUser,
  ) {
    return this.adminService.updateUserRole(id, dto.role, admin.id);
  }

  @Put('users/:id/verify')
  async verifyUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyUserDto,
    @CurrentUser() admin: JwtUser,
  ) {
    return this.adminService.verifyUser(id, dto.verified, admin.id);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  async deactivateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtUser,
  ) {
    return this.adminService.deactivateUser(id, admin.id);
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ): Promise<ApiResponse<any>> {
    const parsedPage = page ? Math.max(1, parseInt(page, 10)) : undefined;
    const parsedLimit = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10)))
      : undefined;

    const result = await this.adminService.getAuditLogs({
      page: parsedPage,
      limit: parsedLimit,
      userId,
      action,
      entityType,
    });
    return { success: true, data: result };
  }

  @Post('profiles/:id/feature')
  async featureProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { featured?: boolean },
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? randomUUID();
    const result = await this.adminService.featureProfile(
      id,
      body.featured !== false,
      user.id,
      correlationId,
    );
    return { success: true, data: result };
  }
}
