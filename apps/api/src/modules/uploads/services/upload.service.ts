import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg';
}

const PROFILE_PHOTO_PRESETS = {
  thumbnail: { width: 80, height: 80, quality: 70, format: 'webp' as const },
  card: { width: 400, height: 300, quality: 80, format: 'webp' as const },
  full: { width: 1200, height: 900, quality: 90, format: 'webp' as const },
} as const;

export type ProfilePhotoSize = keyof typeof PROFILE_PHOTO_PRESETS;

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly cdnUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>(
      'S3_ENDPOINT',
      'http://localhost:9000',
    );
    this.bucket = this.configService.get<string>(
      'S3_BUCKET',
      'marketplace-uploads',
    );
    this.cdnUrl = this.configService.get<string>('CDN_URL', '') || null;

    this.s3 = new S3Client({
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY', ''),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY', ''),
      },
      forcePathStyle: true,
    });

    this.logger.log({
      message: 'UploadService initialized',
      endpoint: this.endpoint,
      bucket: this.bucket,
      cdnUrl: this.cdnUrl ?? 'not configured (using S3 public URL)',
    });
  }

  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 300,
  ): Promise<{ url: string; key: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.s3, command, { expiresIn });

    this.logger.log({
      message: 'Presigned upload URL generated',
      key,
      contentType,
      expiresIn,
    });

    return { url, key };
  }

  async generatePresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3, command, { expiresIn });

    this.logger.log({
      message: 'Presigned download URL generated',
      key,
      expiresIn,
    });

    return url;
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3.send(command);

    this.logger.log({
      message: 'Object deleted from S3',
      key,
    });
  }

  buildPublicUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  getCdnUrl(key: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${key}`;
    }
    return this.buildPublicUrl(key);
  }

  getImageUrl(key: string, options?: ImageTransformOptions): string {
    const baseUrl = this.getCdnUrl(key);

    if (!options) {
      return baseUrl;
    }

    const params = new URLSearchParams();
    if (options.width) params.set('w', String(options.width));
    if (options.height) params.set('h', String(options.height));
    if (options.quality) params.set('q', String(options.quality));
    if (options.format) params.set('fmt', options.format);

    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }

  getOptimizedProfilePhoto(
    key: string,
    size: ProfilePhotoSize,
  ): string {
    return this.getImageUrl(key, PROFILE_PHOTO_PRESETS[size]);
  }

  transformPhotosToCdn(photos: string[]): string[] {
    return photos.map((photo) => this.getCdnUrl(photo));
  }
}
