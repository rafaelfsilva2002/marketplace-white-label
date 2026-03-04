import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true },
  );

  // Security headers (Helmet) + response compression
  const fastifyInstance = app.getHttpAdapter().getInstance();
  await fastifyInstance.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false, // Let frontend handle CSP
  });
  await fastifyInstance.register(import('@fastify/compress'), { global: true });

  // Enable graceful shutdown hooks (listens for SIGTERM, SIGINT, etc.)
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(s => s.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  setupSwagger(app);

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`API running on http://localhost:${port}`);

  process.on('SIGTERM', () => {
    logger.log('SIGTERM received — starting graceful shutdown');
  });

  process.on('SIGINT', () => {
    logger.log('SIGINT received — starting graceful shutdown');
  });
}

bootstrap();
