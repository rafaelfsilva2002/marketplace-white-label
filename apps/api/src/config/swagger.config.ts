import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Marketplace AI-Native API')
    .setDescription(
      'REST API for the AI-Native professional services marketplace. ' +
        'Includes semantic search, AI moderation, fraud detection, and dynamic pricing.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication and authorization')
    .addTag('Profiles', 'Professional profile management')
    .addTag('Search', 'Semantic and traditional search')
    .addTag('Reviews', 'Ratings and reviews')
    .addTag('Payments', 'Stripe Connect payments')
    .addTag('Subscriptions', 'Subscription plans and billing')
    .addTag('Moderation', 'Content and photo moderation')
    .addTag('Recommendations', 'AI-powered recommendations')
    .addTag('Pricing', 'Dynamic pricing analytics')
    .addTag('Webhooks', 'External service webhooks')
    .addTag('Admin', 'Platform administration')
    .addTag('Crypto', 'Cryptocurrency payments')
    .addTag('AML', 'Anti-money laundering compliance')
    .addTag('Workflows', 'Workflow orchestration engine')
    .addTag('Agents', 'AI agents with persistent state')
    .addTag('Experiments', 'A/B testing for AI models and prompts')
    .addTag('Notifications', 'Real-time WebSocket notifications')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);
}
