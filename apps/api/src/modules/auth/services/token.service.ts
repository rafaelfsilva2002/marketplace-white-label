import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { Database, refreshTokens } from '@marketplace/database';
import { UserRole } from '@marketplace/shared';
import { DATABASE_TOKEN } from '@/config/database.config';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTokenTtlMs: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {
    const refreshDays = this.configService.get<number>(
      'REFRESH_TOKEN_DAYS',
      7,
    );
    this.refreshTokenTtlMs = refreshDays * 24 * 60 * 60 * 1000;
  }

  async generateTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    correlationId: string,
    existingFamily?: string,
  ): Promise<TokenPair> {
    const expiresInSeconds = this.configService.get<number>(
      'JWT_EXPIRES_IN_SECONDS',
      900,
    );

    const payload: AccessTokenPayload = {
      sub: userId,
      email,
      role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: expiresInSeconds,
    });

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const family = existingFamily ?? crypto.randomUUID();

    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);

    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash,
      family,
      isRevoked: false,
      expiresAt,
    });

    this.logger.log({
      message: 'Token pair generated',
      userId,
      family,
      correlationId,
    });

    const refreshTokenValue = `${family}:${rawRefreshToken}`;

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: expiresInSeconds,
    };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return this.jwtService.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async rotateRefreshToken(
    rawRefreshToken: string,
    correlationId: string,
  ): Promise<{ userId: string; email: string; role: UserRole; family: string }> {
    const parts = rawRefreshToken.split(':');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Malformed refresh token');
    }

    const [family, tokenValue] = parts;
    const tokenHash = this.hashToken(tokenValue);

    const [storedToken] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.family, family),
        ),
      )
      .limit(1);

    if (!storedToken) {
      this.logger.warn({
        message: 'Refresh token not found — possible token reuse attack',
        family,
        correlationId,
      });
      await this.revokeFamily(family, correlationId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.isRevoked) {
      this.logger.warn({
        message: 'Revoked refresh token used — token reuse detected',
        family,
        userId: storedToken.userId,
        correlationId,
      });
      await this.revokeFamily(family, correlationId);
      throw new UnauthorizedException(
        'Refresh token has been revoked — all sessions in this family have been invalidated',
      );
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.id, storedToken.id));

    this.logger.log({
      message: 'Refresh token rotated',
      userId: storedToken.userId,
      family,
      correlationId,
    });

    return {
      userId: storedToken.userId,
      email: '',
      role: UserRole.User,
      family,
    };
  }

  async revokeFamily(family: string, correlationId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.family, family));

    this.logger.log({
      message: 'Token family revoked',
      family,
      correlationId,
    });
  }

  async revokeAllUserTokens(
    userId: string,
    correlationId: string,
  ): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));

    this.logger.log({
      message: 'All user tokens revoked',
      userId,
      correlationId,
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
