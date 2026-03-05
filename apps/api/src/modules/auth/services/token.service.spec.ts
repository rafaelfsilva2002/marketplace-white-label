import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function chainedInsert() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function chainedUpdate() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenService', () => {
  let service: TokenService;
  let mockJwtService: Record<string, ReturnType<typeof vi.fn>>;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJwtService = {
      sign: vi.fn().mockReturnValue('access-token-jwt'),
      verify: vi.fn().mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'user',
      }),
    };

    mockConfigService = {
      get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        const config: Record<string, unknown> = {
          REFRESH_TOKEN_DAYS: 7,
          JWT_EXPIRES_IN_SECONDS: 900,
        };
        return config[key] ?? defaultVal;
      }),
    };

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    service = new TokenService(
      mockJwtService as any,
      mockConfigService as any,
      mockDb as any,
    );
  });

  // -------------------------------------------------------------------------
  // generateTokenPair
  // -------------------------------------------------------------------------

  describe('generateTokenPair', () => {
    it('should return an access token, refresh token, and expiresIn', async () => {
      mockDb.insert.mockReturnValue(chainedInsert());

      const result = await service.generateTokenPair(
        'user-1',
        'test@example.com',
        'user' as any,
        'corr-1',
      );

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).toContain(':');
      expect(result.expiresIn).toBe(900);
    });

    it('should sign JWT with correct payload and expiry', async () => {
      mockDb.insert.mockReturnValue(chainedInsert());

      await service.generateTokenPair('user-1', 'test@example.com', 'user' as any, 'corr-1');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-1', email: 'test@example.com', role: 'user' },
        { expiresIn: 900 },
      );
    });

    it('should store the refresh token hash in the database', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      await service.generateTokenPair('user-1', 'test@example.com', 'user' as any, 'corr-1');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          isRevoked: false,
        }),
      );
    });

    it('should use existingFamily when provided', async () => {
      const insertMock = chainedInsert();
      mockDb.insert.mockReturnValue(insertMock);

      const result = await service.generateTokenPair(
        'user-1',
        'test@example.com',
        'user' as any,
        'corr-1',
        'existing-family-uuid',
      );

      expect(insertMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          family: 'existing-family-uuid',
        }),
      );
      expect(result.refreshToken).toContain('existing-family-uuid:');
    });

    it('should generate refresh token in family:token format', async () => {
      mockDb.insert.mockReturnValue(chainedInsert());

      const result = await service.generateTokenPair(
        'user-1', 'test@example.com', 'user' as any, 'corr-1',
      );

      const parts = result.refreshToken.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeTruthy(); // family
      expect(parts[1]).toBeTruthy(); // token
    });
  });

  // -------------------------------------------------------------------------
  // verifyAccessToken
  // -------------------------------------------------------------------------

  describe('verifyAccessToken', () => {
    it('should return the decoded payload for a valid token', async () => {
      const result = await service.verifyAccessToken('valid-token');

      expect(result).toEqual({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'user',
      });
    });

    it('should throw UnauthorizedException for an invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verifyAccessToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should include descriptive message in UnauthorizedException', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.verifyAccessToken('bad-token')).rejects.toThrow(
        'Invalid or expired access token',
      );
    });
  });

  // -------------------------------------------------------------------------
  // rotateRefreshToken
  // -------------------------------------------------------------------------

  describe('rotateRefreshToken', () => {
    it('should throw UnauthorizedException for malformed token (no colon)', async () => {
      await expect(
        service.rotateRefreshToken('malformed-token', 'corr-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for malformed token message', async () => {
      await expect(
        service.rotateRefreshToken('no-colon-here', 'corr-1'),
      ).rejects.toThrow('Malformed refresh token');
    });

    it('should throw UnauthorizedException when token is not found in DB', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));
      mockDb.update.mockReturnValue(chainedUpdate());

      await expect(
        service.rotateRefreshToken('family-uuid:token-value', 'corr-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke entire family when token is not found (replay detection)', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));
      mockDb.update.mockReturnValue(chainedUpdate());

      try {
        await service.rotateRefreshToken('family-uuid:token-value', 'corr-1');
      } catch {
        // expected
      }

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is already revoked', async () => {
      const revokedToken = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        family: 'family-uuid',
        isRevoked: true,
        expiresAt: new Date(Date.now() + 86400000),
      };

      mockDb.select.mockReturnValue(chainedSelect([revokedToken]));
      mockDb.update.mockReturnValue(chainedUpdate());

      await expect(
        service.rotateRefreshToken('family-uuid:token-value', 'corr-1'),
      ).rejects.toThrow('Refresh token has been revoked');
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const expiredToken = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        family: 'family-uuid',
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000),
      };

      mockDb.select.mockReturnValue(chainedSelect([expiredToken]));

      await expect(
        service.rotateRefreshToken('family-uuid:token-value', 'corr-1'),
      ).rejects.toThrow('Refresh token has expired');
    });

    it('should revoke the used token and return user info for a valid token', async () => {
      const validToken = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        family: 'family-uuid',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
      };

      mockDb.select.mockReturnValue(chainedSelect([validToken]));
      mockDb.update.mockReturnValue(chainedUpdate());

      const result = await service.rotateRefreshToken(
        'family-uuid:token-value',
        'corr-1',
      );

      expect(result.userId).toBe('user-1');
      expect(result.family).toBe('family-uuid');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // revokeFamily
  // -------------------------------------------------------------------------

  describe('revokeFamily', () => {
    it('should revoke all tokens in the family', async () => {
      mockDb.update.mockReturnValue(chainedUpdate());

      await service.revokeFamily('family-uuid', 'corr-1');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // revokeAllUserTokens
  // -------------------------------------------------------------------------

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', async () => {
      mockDb.update.mockReturnValue(chainedUpdate());

      await service.revokeAllUserTokens('user-1', 'corr-1');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
