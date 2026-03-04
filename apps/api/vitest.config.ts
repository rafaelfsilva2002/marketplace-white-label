import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'src') + '/',
      '@marketplace/database': path.resolve(
        __dirname,
        '../../packages/database/src',
      ),
      '@marketplace/shared': path.resolve(
        __dirname,
        '../../packages/shared/src',
      ),
      '@marketplace/ai-gateway': path.resolve(
        __dirname,
        '../../packages/ai-gateway/src',
      ),
      'drizzle-orm': path.resolve(
        __dirname,
        '../../packages/database/node_modules/drizzle-orm',
      ),
    },
  },
});
