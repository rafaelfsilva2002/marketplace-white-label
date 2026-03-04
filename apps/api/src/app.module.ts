import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { SearchModule } from './modules/search/search.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { AmlModule } from './modules/aml/aml.module';
import { AdminModule } from './modules/admin/admin.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { AgentsModule } from './modules/agents/agents.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate,
    }),
    HealthModule,
    AuthModule,
    ProfilesModule,
    SearchModule,
    ReviewsModule,
    ModerationModule,
    PaymentsModule,
    SubscriptionsModule,
    WebhooksModule,
    RecommendationsModule,
    PricingModule,
    CryptoModule,
    AmlModule,
    AdminModule,
    WorkflowsModule,
    AgentsModule,
    ExperimentsModule,
    NotificationsModule,
    UploadsModule,
  ],
})
export class AppModule {}
