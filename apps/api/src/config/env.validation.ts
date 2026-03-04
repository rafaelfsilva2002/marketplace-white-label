import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string({
    required_error: 'DATABASE_URL is required',
  }),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string({
    required_error: 'JWT_SECRET is required',
  }),

  JWT_REFRESH_SECRET: z.string({
    required_error: 'JWT_REFRESH_SECRET is required',
  }),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('marketplace-uploads'),

  FRONTEND_URL: z.string().default('http://localhost:3000'),

  CORS_ORIGINS: z.string().optional(),

  PORT: z.coerce.number().default(3001),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Environment validation failed:\n${formatted}`,
    );
  }

  return result.data;
}
