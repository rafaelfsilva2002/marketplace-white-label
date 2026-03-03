import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { Database, users } from '@marketplace/database';
import { UserRole } from '@marketplace/shared';
import { DATABASE_TOKEN } from '@/config/database.config';
import { TokenService, TokenPair } from './token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';

const BCRYPT_ROUNDS = 12;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isVerified: boolean | null;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly tokenService: TokenService,
  ) {}

  async register(
    dto: RegisterDto,
    correlationId: string,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const role = dto.role ?? UserRole.User;

    const [newUser] = await this.db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone ?? null,
        role,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      });

    this.logger.log({
      message: 'User registered',
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      correlationId,
    });

    const tokens = await this.tokenService.generateTokenPair(
      newUser.id,
      newUser.email,
      newUser.role as UserRole,
      correlationId,
    );

    return {
      ...tokens,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role as UserRole,
        isVerified: newUser.isVerified,
        createdAt: newUser.createdAt,
      },
    };
  }

  async login(
    dto: LoginDto,
    correlationId: string,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        name: users.name,
        role: users.role,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.email, dto.email.toLowerCase()))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log({
      message: 'User logged in',
      userId: user.id,
      correlationId,
    });

    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.role as UserRole,
      correlationId,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      },
    };
  }

  async refresh(
    refreshToken: string,
    correlationId: string,
  ): Promise<TokenPair> {
    const rotationResult = await this.tokenService.rotateRefreshToken(
      refreshToken,
      correlationId,
    );

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, rotationResult.userId))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User account is no longer active');
    }

    this.logger.log({
      message: 'Token refreshed',
      userId: user.id,
      family: rotationResult.family,
      correlationId,
    });

    return this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.role as UserRole,
      correlationId,
      rotationResult.family,
    );
  }

  async logout(userId: string, correlationId: string): Promise<void> {
    await this.tokenService.revokeAllUserTokens(userId, correlationId);

    this.logger.log({
      message: 'User logged out — all tokens revoked',
      userId,
      correlationId,
    });
  }

  async getProfile(userId: string): Promise<AuthenticatedUser> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };
  }
}
