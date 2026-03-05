import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadService } from './upload.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
  PutObjectCommand: vi.fn().mockImplementation((args) => args),
  GetObjectCommand: vi.fn().mockImplementation((args) => args),
  DeleteObjectCommand: vi.fn().mockImplementation((args) => args),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url'),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UploadService', () => {
  let service: UploadService;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService = {
      get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        const config: Record<string, unknown> = {
          S3_ENDPOINT: 'http://localhost:9000',
          S3_BUCKET: 'test-bucket',
          CDN_URL: 'https://cdn.example.com',
          S3_REGION: 'us-east-1',
          S3_ACCESS_KEY: 'test-key',
          S3_SECRET_KEY: 'test-secret',
        };
        return config[key] ?? defaultVal;
      }),
    };

    service = new UploadService(mockConfigService as any);
  });

  // -------------------------------------------------------------------------
  // generatePresignedUploadUrl
  // -------------------------------------------------------------------------

  describe('generatePresignedUploadUrl', () => {
    it('should return a presigned URL and the key', async () => {
      const result = await service.generatePresignedUploadUrl(
        'photos/test.jpg',
        'image/jpeg',
      );

      expect(result.url).toBe('https://s3.example.com/signed-url');
      expect(result.key).toBe('photos/test.jpg');
    });

    it('should use default expiry of 300 seconds', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      await service.generatePresignedUploadUrl('key.jpg', 'image/jpeg');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });

    it('should use custom expiry when provided', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      await service.generatePresignedUploadUrl('key.jpg', 'image/jpeg', 600);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 600 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // generatePresignedDownloadUrl
  // -------------------------------------------------------------------------

  describe('generatePresignedDownloadUrl', () => {
    it('should return a presigned download URL', async () => {
      const url = await service.generatePresignedDownloadUrl('photos/test.jpg');

      expect(url).toBe('https://s3.example.com/signed-url');
    });

    it('should use default expiry of 3600 seconds', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      await service.generatePresignedDownloadUrl('key.jpg');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // deleteObject
  // -------------------------------------------------------------------------

  describe('deleteObject', () => {
    it('should send delete command without throwing', async () => {
      await expect(service.deleteObject('photos/test.jpg')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // buildPublicUrl
  // -------------------------------------------------------------------------

  describe('buildPublicUrl', () => {
    it('should build a public URL from endpoint, bucket, and key', () => {
      const url = service.buildPublicUrl('photos/test.jpg');

      expect(url).toBe('http://localhost:9000/test-bucket/photos/test.jpg');
    });
  });

  // -------------------------------------------------------------------------
  // getCdnUrl
  // -------------------------------------------------------------------------

  describe('getCdnUrl', () => {
    it('should return CDN URL when CDN is configured', () => {
      const url = service.getCdnUrl('photos/test.jpg');

      expect(url).toBe('https://cdn.example.com/photos/test.jpg');
    });

    it('should fall back to public URL when CDN is not configured', () => {
      const noCdnConfig: Record<string, ReturnType<typeof vi.fn>> = {
        get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
          const config: Record<string, unknown> = {
            S3_ENDPOINT: 'http://localhost:9000',
            S3_BUCKET: 'test-bucket',
            CDN_URL: '',
            S3_REGION: 'us-east-1',
            S3_ACCESS_KEY: 'key',
            S3_SECRET_KEY: 'secret',
          };
          return config[key] ?? defaultVal;
        }),
      };

      const noCdnService = new UploadService(noCdnConfig as any);
      const url = noCdnService.getCdnUrl('photos/test.jpg');

      expect(url).toBe('http://localhost:9000/test-bucket/photos/test.jpg');
    });
  });

  // -------------------------------------------------------------------------
  // getImageUrl
  // -------------------------------------------------------------------------

  describe('getImageUrl', () => {
    it('should return base CDN URL when no options provided', () => {
      const url = service.getImageUrl('photos/test.jpg');

      expect(url).toBe('https://cdn.example.com/photos/test.jpg');
    });

    it('should append width and height as query params', () => {
      const url = service.getImageUrl('photos/test.jpg', {
        width: 400,
        height: 300,
      });

      expect(url).toContain('w=400');
      expect(url).toContain('h=300');
    });

    it('should append quality and format as query params', () => {
      const url = service.getImageUrl('photos/test.jpg', {
        quality: 80,
        format: 'webp',
      });

      expect(url).toContain('q=80');
      expect(url).toContain('fmt=webp');
    });

    it('should return base URL when options object is empty (no fields set)', () => {
      const url = service.getImageUrl('photos/test.jpg', {});

      expect(url).toBe('https://cdn.example.com/photos/test.jpg');
    });
  });

  // -------------------------------------------------------------------------
  // getOptimizedProfilePhoto
  // -------------------------------------------------------------------------

  describe('getOptimizedProfilePhoto', () => {
    it('should return thumbnail preset URL', () => {
      const url = service.getOptimizedProfilePhoto('photos/test.jpg', 'thumbnail');

      expect(url).toContain('w=80');
      expect(url).toContain('h=80');
      expect(url).toContain('q=70');
      expect(url).toContain('fmt=webp');
    });

    it('should return card preset URL', () => {
      const url = service.getOptimizedProfilePhoto('photos/test.jpg', 'card');

      expect(url).toContain('w=400');
      expect(url).toContain('h=300');
      expect(url).toContain('q=80');
    });

    it('should return full preset URL', () => {
      const url = service.getOptimizedProfilePhoto('photos/test.jpg', 'full');

      expect(url).toContain('w=1200');
      expect(url).toContain('h=900');
      expect(url).toContain('q=90');
    });
  });

  // -------------------------------------------------------------------------
  // transformPhotosToCdn
  // -------------------------------------------------------------------------

  describe('transformPhotosToCdn', () => {
    it('should transform all photo keys to CDN URLs', () => {
      const photos = ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'];
      const result = service.transformPhotosToCdn(photos);

      expect(result).toEqual([
        'https://cdn.example.com/photo1.jpg',
        'https://cdn.example.com/photo2.jpg',
        'https://cdn.example.com/photo3.jpg',
      ]);
    });

    it('should return empty array for empty input', () => {
      const result = service.transformPhotosToCdn([]);

      expect(result).toEqual([]);
    });
  });
});
