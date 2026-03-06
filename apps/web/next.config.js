/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@marketplace/shared', '@marketplace/ui'],
  images: {
    remotePatterns: [
      // S3 / MinIO local
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
      // CDN (CloudFront or custom) — configured via NEXT_PUBLIC_CDN_URL
      ...(process.env.NEXT_PUBLIC_CDN_URL
        ? [
            {
              protocol: /** @type {'https'} */ ('https'),
              hostname: new URL(process.env.NEXT_PUBLIC_CDN_URL).hostname,
              pathname: '/**',
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
