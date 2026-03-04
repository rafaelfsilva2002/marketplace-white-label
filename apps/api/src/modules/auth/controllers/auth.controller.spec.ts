import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller';
import { UserRole } from '@marketplace/shared';
import type { RegisterDto } from '../dto/register.dto';
import type { LoginDto } from '../dto/login.dto';
import type { JwtUser } from '../strategies/jwt.strategy';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  name: 'Test User',
  role: UserRole.User,
  isVerified: false,
  createdAt: new Date('2025-01-01'),
};

const FAKE_TOKENS = {
  accessToken: 'jwt.access.token',
  refreshToken: 'family-uuid:raw-refresh-hex',
  expiresIn: 900,
};

const FAKE_AUTH_RESULT = {
  user: FAKE_USER,
  ...FAKE_TOKENS,
};

const FAKE_JWT_USER: JwtUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  role: 'user',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockAuthService = {
      register: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      getProfile: vi.fn(),
    };

    controller = new AuthController(mockAuthService as any);
  });

  // -------------------------------------------------------------------------
  // POST /auth/register
  // -------------------------------------------------------------------------

  describe('POST /auth/register', () => {
    const registerDto: RegisterDto = {
      email: 'new@example.com',
      password: 'SecurePass1',
      name: 'New User',
    };

    it('should call authService.register and return ApiResponse with user and tokens', async () => {
      mockAuthService.register.mockResolvedValue(FAKE_AUTH_RESULT);

      const result = await controller.register(registerDto);

      expect(mockAuthService.register).toHaveBeenCalledWith(
        registerDto,
        expect.any(String),
      );
      expect(result).toEqual({
        success: true,
        data: {
          user: FAKE_USER,
          accessToken: FAKE_TOKENS.accessToken,
          refreshToken: FAKE_TOKENS.refreshToken,
          expiresIn: FAKE_TOKENS.expiresIn,
        },
      });
    });

    it('should use the x-correlation-id header when provided', async () => {
      mockAuthService.register.mockResolvedValue(FAKE_AUTH_RESULT);

      await controller.register(registerDto, 'custom-correlation-id');

      expect(mockAuthService.register).toHaveBeenCalledWith(
        registerDto,
        'custom-correlation-id',
      );
    });

    it('should generate a correlationId when header is not provided', async () => {
      mockAuthService.register.mockResolvedValue(FAKE_AUTH_RESULT);

      await controller.register(registerDto, undefined);

      const callArgs = mockAuthService.register.mock.calls[0];
      expect(callArgs[1]).toBeDefined();
      expect(typeof callArgs[1]).toBe('string');
      // UUID v4 format check
      expect(callArgs[1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should propagate errors thrown by authService.register', async () => {
      mockAuthService.register.mockRejectedValue(
        new Error('Email already registered'),
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should wrap the response in ApiResponse format with success: true', async () => {
      mockAuthService.register.mockResolvedValue(FAKE_AUTH_RESULT);

      const result = await controller.register(registerDto);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.user).toBeDefined();
      expect(result.data.accessToken).toBeDefined();
      expect(result.data.refreshToken).toBeDefined();
      expect(result.data.expiresIn).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/login
  // -------------------------------------------------------------------------

  describe('POST /auth/login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'SecurePass1',
    };

    it('should call authService.login and return ApiResponse with user and tokens', async () => {
      mockAuthService.login.mockResolvedValue(FAKE_AUTH_RESULT);

      const result = await controller.login(loginDto);

      expect(mockAuthService.login).toHaveBeenCalledWith(
        loginDto,
        expect.any(String),
      );
      expect(result).toEqual({
        success: true,
        data: {
          user: FAKE_USER,
          accessToken: FAKE_TOKENS.accessToken,
          refreshToken: FAKE_TOKENS.refreshToken,
          expiresIn: FAKE_TOKENS.expiresIn,
        },
      });
    });

    it('should use the x-correlation-id header when provided', async () => {
      mockAuthService.login.mockResolvedValue(FAKE_AUTH_RESULT);

      await controller.login(loginDto, 'corr-login-123');

      expect(mockAuthService.login).toHaveBeenCalledWith(
        loginDto,
        'corr-login-123',
      );
    });

    it('should propagate UnauthorizedException from authService.login', async () => {
      mockAuthService.login.mockRejectedValue(
        new Error('Invalid email or password'),
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/refresh
  // -------------------------------------------------------------------------

  describe('POST /auth/refresh', () => {
    const refreshToken = 'family-uuid:raw-refresh-hex';

    it('should call authService.refresh and return new token pair without user', async () => {
      mockAuthService.refresh.mockResolvedValue(FAKE_TOKENS);

      const result = await controller.refresh(refreshToken);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        refreshToken,
        expect.any(String),
      );
      expect(result).toEqual({
        success: true,
        data: {
          accessToken: FAKE_TOKENS.accessToken,
          refreshToken: FAKE_TOKENS.refreshToken,
          expiresIn: FAKE_TOKENS.expiresIn,
        },
      });
    });

    it('should use the x-correlation-id header when provided', async () => {
      mockAuthService.refresh.mockResolvedValue(FAKE_TOKENS);

      await controller.refresh(refreshToken, 'corr-refresh-123');

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        refreshToken,
        'corr-refresh-123',
      );
    });

    it('should not include user data in the refresh response', async () => {
      mockAuthService.refresh.mockResolvedValue(FAKE_TOKENS);

      const result = await controller.refresh(refreshToken);

      expect((result.data as any).user).toBeUndefined();
    });

    it('should propagate errors from authService.refresh', async () => {
      mockAuthService.refresh.mockRejectedValue(
        new Error('Invalid refresh token'),
      );

      await expect(controller.refresh(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/logout
  // -------------------------------------------------------------------------

  describe('POST /auth/logout', () => {
    it('should call authService.logout with the user id and return success message', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(FAKE_JWT_USER);

      expect(mockAuthService.logout).toHaveBeenCalledWith(
        FAKE_JWT_USER.id,
        expect.any(String),
      );
      expect(result).toEqual({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    });

    it('should use the x-correlation-id header when provided', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(FAKE_JWT_USER, 'corr-logout-123');

      expect(mockAuthService.logout).toHaveBeenCalledWith(
        FAKE_JWT_USER.id,
        'corr-logout-123',
      );
    });

    it('should propagate errors from authService.logout', async () => {
      mockAuthService.logout.mockRejectedValue(
        new Error('Logout failed'),
      );

      await expect(controller.logout(FAKE_JWT_USER)).rejects.toThrow(
        'Logout failed',
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /auth/me
  // -------------------------------------------------------------------------

  describe('GET /auth/me', () => {
    it('should call authService.getProfile and return the user profile', async () => {
      mockAuthService.getProfile.mockResolvedValue(FAKE_USER);

      const result = await controller.me(FAKE_JWT_USER);

      expect(mockAuthService.getProfile).toHaveBeenCalledWith(FAKE_JWT_USER.id);
      expect(result).toEqual({
        success: true,
        data: FAKE_USER,
      });
    });

    it('should use the x-correlation-id header when provided', async () => {
      mockAuthService.getProfile.mockResolvedValue(FAKE_USER);

      await controller.me(FAKE_JWT_USER, 'corr-me-123');

      // getProfile doesn't receive correlationId, just verifying no error
      expect(mockAuthService.getProfile).toHaveBeenCalledWith(FAKE_JWT_USER.id);
    });

    it('should propagate errors from authService.getProfile', async () => {
      mockAuthService.getProfile.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(controller.me(FAKE_JWT_USER)).rejects.toThrow(
        'User not found',
      );
    });
  });
});
