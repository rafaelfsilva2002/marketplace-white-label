import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('JWT_EXPIRES_IN_SECONDS', 900),
          issuer: 'marketplace-api',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    DatabaseProvider,
    AuthService,
    TokenService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
  exports: [
    DATABASE_TOKEN,
    AuthService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
})
export class AuthModule {}
