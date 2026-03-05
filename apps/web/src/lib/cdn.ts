const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL;

type ImageFormat = 'webp' | 'avif' | 'jpeg';

interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: ImageFormat;
}

const PROFILE_PHOTO_PRESETS = {
  thumbnail: { width: 80, height: 80, quality: 70, format: 'webp' as const },
  card: { width: 400, height: 300, quality: 80, format: 'webp' as const },
  full: { width: 1200, height: 900, quality: 90, format: 'webp' as const },
} as const;

type ProfilePhotoSize = keyof typeof PROFILE_PHOTO_PRESETS;

export function getImageUrl(
  src: string,
  options?: ImageTransformOptions,
): string {
  if (!options) {
    return src;
  }

  const params = new URLSearchParams();
  if (options.width) params.set('w', String(options.width));
  if (options.height) params.set('h', String(options.height));
  if (options.quality) params.set('q', String(options.quality));
  if (options.format) params.set('fmt', options.format);

  const qs = params.toString();
  return qs ? `${src}?${qs}` : src;
}

export function getOptimizedProfilePhoto(
  src: string,
  size: ProfilePhotoSize,
): string {
  return getImageUrl(src, PROFILE_PHOTO_PRESETS[size]);
}

export function getCdnHostname(): string | null {
  if (!CDN_URL) return null;
  try {
    return new URL(CDN_URL).hostname;
  } catch {
    return null;
  }
}
