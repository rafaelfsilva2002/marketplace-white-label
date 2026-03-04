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
import { v4 as uuidv4 } from 'uuid';
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

  async requestEmailVerification(
    userId: string,
    correlationId: string,
  ): Promise<{ message: string; token: string }> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        isVerified: users.isVerified,
        metadata: users.metadata,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified) throw new ConflictException('Email already verified');

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.db
      .update(users)
      .set({
        metadata: {
          ...((user.metadata as Record<string, unknown>) || {}),
          emailVerificationToken: token,
          emailVerificationExpires: expiresAt.toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    this.logger.log({
      message: 'Email verification requested',
      userId,
      correlationId,
    });

    return { message: 'Verification email sent', token };
  }

  async verifyEmail(
    token: string,
    correlationId: string,
  ): Promise<{ message: string }> {
    const allUsers = await this.db
      .select({ id: users.id, metadata: users.metadata })
      .from(users)
      .limit(1000);

    const user = allUsers.find((u) => {
      const meta = u.metadata as Record<string, unknown> | null;
      return meta?.emailVerificationToken === token;
    });

    if (!user)
      throw new NotFoundException('Invalid or expired verification token');

    const meta = user.metadata as Record<string, unknown>;
    const expires = meta.emailVerificationExpires as string;
    if (new Date(expires) < new Date()) {
      throw new UnauthorizedException('Verification token expired');
    }

    await this.db
      .update(users)
      .set({
        isVerified: true,
        verifiedAt: new Date(),
        metadata: {
          ...(meta || {}),
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    this.logger.log({
      message: 'Email verified',
      userId: user.id,
      correlationId,
    });

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(
    email: string,
    correlationId: string,
  ): Promise<{ message: string; token?: string }> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        metadata: users.metadata,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user || user.deletedAt) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await this.db
      .update(users)
      .set({
        metadata: {
          ...((user.metadata as Record<string, unknown>) || {}),
          resetPasswordToken: token,
          resetPasswordExpires: expiresAt.toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    this.logger.log({
      message: 'Password reset requested',
      userId: user.id,
      correlationId,
    });

    return { message: 'If the email exists, a reset link has been sent', token };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    correlationId: string,
  ): Promise<{ message: string }> {
    const allUsers = await this.db
      .select({ id: users.id, metadata: users.metadata })
      .from(users)
      .limit(1000);

    const user = allUsers.find((u) => {
      const meta = u.metadata as Record<string, unknown> | null;
      return meta?.resetPasswordToken === token;
    });

    if (!user) throw new NotFoundException('Invalid or expired reset token');

    const meta = user.metadata as Record<string, unknown>;
    const expires = meta.resetPasswordExpires as string;
    if (new Date(expires) < new Date()) {
      throw new UnauthorizedException('Reset token expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db
      .update(users)
      .set({
        passwordHash,
        metadata: {
          ...(meta || {}),
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    this.logger.log({
      message: 'Password reset completed',
      userId: user.id,
      correlationId,
    });

    return { message: 'Password reset successfully' };
  }
}
