import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '@marketplace/shared';
import { UserRole } from '@marketplace/shared';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { UploadService } from '../services/upload.service';
import { CreatePresignedUrlDto } from '../dto/create-presigned-url.dto';

interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  cdnUrl: string;
}

@ApiTags('Uploads')
@Controller('uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate a presigned upload URL' })
  @ApiBearerAuth()
  async createPresignedUrl(
    @Body() dto: CreatePresignedUrlDto,
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<PresignedUrlResponse>> {
    const correlationId = headerCorrelationId ?? uuidv4();
    const folder = dto.folder ?? 'profiles';
    const ext = dto.fileName.split('.').pop() ?? 'jpg';
    const key = `${folder}/${uuidv4()}.${ext}`;

    this.logger.log({
      message: 'Presigned upload URL requested',
      userId: user.id,
      fileName: dto.fileName,
      contentType: dto.contentType,
      key,
      correlationId,
    });

    const result = await this.uploadService.generatePresignedUploadUrl(
      key,
      dto.contentType,
    );

    return {
      success: true,
      data: {
        uploadUrl: result.url,
        key: result.key,
        publicUrl: this.uploadService.buildPublicUrl(result.key),
        cdnUrl: this.uploadService.getCdnUrl(result.key),
      },
    };
  }

  @Delete(':key(*)')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Delete an uploaded file (admin only)' })
  @ApiBearerAuth()
  async deleteFile(
    @Param('key') key: string,
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'File deletion requested',
      userId: user.id,
      key,
      correlationId,
    });

    await this.uploadService.deleteObject(key);

    return {
      success: true,
      data: { message: `File ${key} deleted successfully` },
    };
  }
}
