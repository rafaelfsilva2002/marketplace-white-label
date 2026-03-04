import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DATABASE_TOKEN } from '@/config/database.config';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { ReviewQueueService } from '../services/review-queue.service';
import { SarService } from '../services/sar.service';
import { BlacklistService } from '../services/blacklist.service';
import type { Database } from '@marketplace/database';

@Controller('aml')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AmlController {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly reviewQueue: ReviewQueueService,
    private readonly sarService: SarService,
    private readonly blacklistService: BlacklistService,
  ) {}

  // --- Review Queue (moderator/admin) ---

  @Get('queue')
  @Roles('moderator', 'admin')
  async listQueue(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reviewQueue.listPending(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('queue/:id')
  @Roles('moderator', 'admin')
  async getQueueItem(@Param('id') id: string) {
    return this.reviewQueue.getById(id);
  }

  @Post('queue/:id/approve')
  @Roles('moderator', 'admin')
  async approveItem(@Param('id') id: string, @Request() req: any) {
    return this.reviewQueue.approve(id, req.user.id);
  }

  @Post('queue/:id/reject')
  @Roles('moderator', 'admin')
  async rejectItem(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { notes?: string },
  ) {
    return this.reviewQueue.reject(id, req.user.id, body.notes);
  }

  @Post('queue/:id/assign')
  @Roles('admin')
  async assignItem(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { assignedTo: string },
  ) {
    return this.reviewQueue.assign(id, body.assignedTo, req.user.id);
  }

  // --- SARs (admin only) ---

  @Get('sars')
  @Roles('admin')
  async listSars(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sarService.list(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('sars/:id')
  @Roles('admin')
  async getSar(@Param('id') id: string) {
    return this.sarService.getById(id);
  }

  @Patch('sars/:id')
  @Roles('admin')
  async updateSar(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { status: 'reviewed' | 'filed' | 'dismissed' },
  ) {
    return this.sarService.updateStatus(id, body.status, req.user.id);
  }

  // --- Blacklists (admin only) ---

  @Get('blacklists')
  @Roles('admin')
  async listBlacklists(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.blacklistService.list(
      limit ? parseInt(limit) : 100,
      offset ? parseInt(offset) : 0,
    );
  }

  @Post('blacklists')
  @Roles('admin')
  async addToBlacklist(
    @Request() req: any,
    @Body() body: { address: string; reason: string; chain?: string },
  ) {
    return this.blacklistService.add(
      body.address,
      body.reason,
      req.user.id,
      body.chain,
    );
  }

  @Delete('blacklists/:id')
  @Roles('admin')
  async removeFromBlacklist(@Param('id') id: string, @Request() req: any) {
    return this.blacklistService.remove(id, req.user.id);
  }

  // --- Screenings (admin, read-only) ---

  @Get('screenings')
  @Roles('admin')
  async listScreenings(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.db.query.amlScreenings.findMany({
      orderBy: (s: any, { desc }: any) => [desc(s.createdAt)],
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }
}
