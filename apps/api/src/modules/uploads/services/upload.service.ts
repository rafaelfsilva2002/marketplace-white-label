import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>(
      'S3_ENDPOINT',
      'http://localhost:9000',
    );
    this.bucket = this.configService.get<string>(
      'S3_BUCKET',
      'marketplace-uploads',
    );

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
}
