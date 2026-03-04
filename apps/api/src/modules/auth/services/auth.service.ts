import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
import { UpdateProfileDto } from '../dto/update-profile.dto';

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

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    correlationId: string,
  ): Promise<AuthenticatedUser> {
    if (dto.email) {
      const [existing] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, dto.email.toLowerCase()))
        .limit(1);

      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }

      dto.email = dto.email.toLowerCase();
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phone !== undefined) updateData.phone = dto.phone;

    const [updated] = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      });

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    this.logger.log({
      message: 'User profile updated',
      userId,
      correlationId,
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role as UserRole,
      isVerified: updated.isVerified,
      createdAt: updated.createdAt,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    correlationId: string,
  ): Promise<{ message: string }> {
    const [user] = await this.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    this.logger.log({
      message: 'User password changed',
      userId,
      correlationId,
    });

    return { message: 'Password changed successfully' };
  }

  async deleteAccount(
    userId: string,
    correlationId: string,
  ): Promise<{ message: string }> {
    const [user] = await this.db
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    await this.db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));

    await this.tokenService.revokeAllUserTokens(userId, correlationId);

    this.logger.log({
      message: 'User account deleted (soft delete)',
      userId,
      correlationId,
    });

    return { message: 'Account deleted' };
  }
}
