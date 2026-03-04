import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '@marketplace/shared';
import type { RegisterDto } from '../dto/register.dto';
import type { LoginDto } from '../dto/login.dto';

// Mock bcryptjs at module level
vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

import * as bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createChainedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function createChainedInsert(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

const FAKE_USER = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  name: 'Test User',
  role: UserRole.User,
  isVerified: false,
  createdAt: new Date('2025-01-01'),
  passwordHash: '$2a$12$hashedpassword',
  deletedAt: null,
};

const FAKE_TOKEN_PAIR = {
  accessToken: 'jwt.access.token',
  refreshToken: 'family-uuid:raw-refresh-hex',
  expiresIn: 900,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockTokenService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
    };

    mockTokenService = {
      generateTokenPair: vi.fn().mockResolvedValue(FAKE_TOKEN_PAIR),
      rotateRefreshToken: vi.fn(),
      revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      mockDb as any,
      mockTokenService as any,
    );
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'New@Example.COM',
      password: 'SecurePass1',
      name: 'New User',
    };
    const correlationId = 'corr-register-1';

    it('should hash the password and create a new user', async () => {
      // No existing user
      mockDb.select.mockReturnValue(createChainedSelect([]));
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue(
        '$2a$12$newhashedpw',
      );

      const createdUser = {
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'New User',
        role: UserRole.User,
        isVerified: false,
        createdAt: new Date(),
      };

      mockDb.insert.mockReturnValue(createChainedInsert([createdUser]));

      const result = await service.register(dto, correlationId);

      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePass1', 12);
      expect(result.accessToken).toBe(FAKE_TOKEN_PAIR.accessToken);
      expect(result.refreshToken).toBe(FAKE_TOKEN_PAIR.refreshToken);
      expect(result.user.email).toBe('new@example.com');
      expect(result.user.role).toBe(UserRole.User);
      expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(
        'new-user-id',
        'new@example.com',
        UserRole.User,
        correlationId,
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      mockDb.select.mockReturnValue(
        createChainedSelect([{ id: 'existing-id' }]),
      );

      await expect(service.register(dto, correlationId)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(dto, correlationId)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should default to UserRole.User when no role is specified', async () => {
      mockDb.select.mockReturnValue(createChainedSelect([]));
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed');

      const createdUser = {
        id: 'uid',
        email: 'new@example.com',
        name: 'New User',
        role: UserRole.User,
        isVerified: false,
        createdAt: new Date(),
      };
      mockDb.insert.mockReturnValue(createChainedInsert([createdUser]));

      const result = await service.register(dto, correlationId);

      expect(result.user.role).toBe(UserRole.User);
    });

    it('should use the specified role when provided', async () => {
      const dtoWithRole: RegisterDto = {
        ...dto,
        role: UserRole.Professional,
      };

      mockDb.select.mockReturnValue(createChainedSelect([]));
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed');

      const createdUser = {
        id: 'uid',
        email: 'new@example.com',
        name: 'New User',
        role: UserRole.Professional,
        isVerified: false,
        createdAt: new Date(),
      };
      mockDb.insert.mockReturnValue(createChainedInsert([createdUser]));

      const result = await service.register(dtoWithRole, correlationId);

      expect(result.user.role).toBe(UserRole.Professional);
    });

    it('should lowercase the email before checking and inserting', async () => {
      mockDb.select.mockReturnValue(createChainedSelect([]));
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed');

      const createdUser = {
        id: 'uid',
        email: 'new@example.com',
        name: 'New User',
        role: UserRole.User,
        isVerified: false,
        createdAt: new Date(),
      };
      mockDb.insert.mockReturnValue(createChainedInsert([createdUser]));

      const result = await service.register(dto, correlationId);

      expect(result.user.email).toBe('new@example.com');
    });
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe('login', () => {
    const dto: LoginDto = {
      email: 'Test@Example.COM',
      password: 'SecurePass1',
    };
    const correlationId = 'corr-login-1';

    it('should validate credentials and return tokens', async () => {
      mockDb.select.mockReturnValue(createChainedSelect([FAKE_USER]));
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await service.login(dto, correlationId);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'SecurePass1',
        FAKE_USER.passwordHash,
      );
      expect(result.accessToken).toBe(FAKE_TOKEN_PAIR.accessToken);
      expect(result.refreshToken).toBe(FAKE_TOKEN_PAIR.refreshToken);
      expect(result.user.id).toBe(FAKE_USER.id);
      expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(
        FAKE_USER.id,
        FAKE_USER.email,
        UserRole.User,
        correlationId,
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockDb.select.mockReturnValue(createChainedSelect([]));

      await expect(service.login(dto, correlationId)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(dto, correlationId)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw UnauthorizedException when user is soft-deleted', async () => {
      const deletedUser = { ...FAKE_USER, deletedAt: new Date() };
      mockDb.select.mockReturnValue(createChainedSelect([deletedUser]));

      await expect(service.login(dto, correlationId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      mockDb.select.mockReturnValue(createChainedSelect([FAKE_USER]));
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(service.login(dto, correlationId)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(dto, correlationId)).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  // -----------------------------------------------------------------------
  // refresh
  // -----------------------------------------------------------------------

  describe('refresh', () => {
    const correlationId = 'corr-refresh-1';
    const rawRefreshToken = 'family-uuid:raw-refresh-hex';

    it('should rotate the refresh token and return a new token pair', async () => {
      mockTokenService.rotateRefreshToken.mockResolvedValue({
        userId: FAKE_USER.id,
        email: FAKE_USER.email,
        role: UserRole.User,
        family: 'family-uuid',
      });

      mockDb.select.mockReturnValue(
        createChainedSelect([
          {
            id: FAKE_USER.id,
            email: FAKE_USER.email,
            role: UserRole.User,
            deletedAt: null,
          },
        ]),
      );

      const result = await service.refresh(rawRefreshToken, correlationId);

      expect(mockTokenService.rotateRefreshToken).toHaveBeenCalledWith(
        rawRefreshToken,
        correlationId,
      );
      expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(
        FAKE_USER.id,
        FAKE_USER.email,
        UserRole.User,
        correlationId,
        'family-uuid',
      );
      expect(result.accessToken).toBe(FAKE_TOKEN_PAIR.accessToken);
    });

    it('should throw UnauthorizedException when user is deleted after rotation', async () => {
      mockTokenService.rotateRefreshToken.mockResolvedValue({
        userId: 'deleted-user',
        email: '',
        role: UserRole.User,
        family: 'fam',
      });

      mockDb.select.mockReturnValue(
        createChainedSelect([{ id: 'deleted-user', email: 'x', role: 'user', deletedAt: new Date() }]),
      );

      await expect(
        service.refresh(rawRefreshToken, correlationId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found after rotation', async () => {
      mockTokenService.rotateRefreshToken.mockResolvedValue({
        userId: 'nonexistent',
        email: '',
        role: UserRole.User,
        family: 'fam',
      });

      mockDb.select.mockReturnValue(createChainedSelect([]));

      await expect(
        service.refresh(rawRefreshToken, correlationId),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------

  describe('logout', () => {
    it('should revoke all tokens for the user', async () => {
      await service.logout('user-1', 'corr-logout-1');

      expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user-1',
        'corr-logout-1',
      );
    });
  });

  // -----------------------------------------------------------------------
  // getProfile
  // -----------------------------------------------------------------------

  describe('getProfile', () => {
    it('should return the authenticated user profile', async () => {
      const user = {
        id: FAKE_USER.id,
        email: FAKE_USER.email,
        name: FAKE_USER.name,
        role: FAKE_USER.role,
        isVerified: FAKE_USER.isVerified,
        createdAt: FAKE_USER.createdAt,
        deletedAt: null,
      };
      mockDb.select.mockReturnValue(createChainedSelect([user]));

      const result = await service.getProfile(FAKE_USER.id);

      expect(result.id).toBe(FAKE_USER.id);
      expect(result.email).toBe(FAKE_USER.email);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockDb.select.mockReturnValue(createChainedSelect([]));

      await expect(service.getProfile('unknown')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is soft-deleted', async () => {
      mockDb.select.mockReturnValue(
        createChainedSelect([{ ...FAKE_USER, deletedAt: new Date() }]),
      );

      await expect(service.getProfile(FAKE_USER.id)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
