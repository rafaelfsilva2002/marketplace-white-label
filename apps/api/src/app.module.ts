import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
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
  ],
})
export class AppModule {}
