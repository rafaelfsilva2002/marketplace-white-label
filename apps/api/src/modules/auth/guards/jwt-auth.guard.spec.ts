import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockExecutionContext(): ExecutionContext {
  return {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue({
        headers: { authorization: 'Bearer valid-token' },
      }),
      getResponse: vi.fn().mockReturnValue({}),
    }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new JwtAuthGuard();
  });

  // -------------------------------------------------------------------------
  // canActivate
  // -------------------------------------------------------------------------

  describe('canActivate', () => {
    it('should call super.canActivate with the execution context', () => {
      const context = createMockExecutionContext();

      // Spy on AuthGuard's canActivate via the prototype chain
      const superCanActivateSpy = vi
        .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(superCanActivateSpy).toHaveBeenCalledWith(context);
      expect(result).toBe(true);

      superCanActivateSpy.mockRestore();
    });

    it('should return the result from super.canActivate when it returns a promise', async () => {
      const context = createMockExecutionContext();

      const superCanActivateSpy = vi
        .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);

      superCanActivateSpy.mockRestore();
    });

    it('should propagate false from super.canActivate', () => {
      const context = createMockExecutionContext();

      const superCanActivateSpy = vi
        .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(false);

      superCanActivateSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // handleRequest
  // -------------------------------------------------------------------------

  describe('handleRequest', () => {
    it('should return the user when user is valid and no error', () => {
      const user = { id: 'user-1', email: 'test@example.com', role: 'user' };

      const result = guard.handleRequest(null, user);

      expect(result).toEqual(user);
    });

    it('should throw UnauthorizedException when user is falsy', () => {
      expect(() => guard.handleRequest(null, false)).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.handleRequest(null, false)).toThrow(
        'Authentication required',
      );
    });

    it('should throw the provided error when err is set', () => {
      const customError = new Error('Token expired');

      expect(() =>
        guard.handleRequest(customError, { id: 'user-1' }),
      ).toThrow(customError);
    });

    it('should throw the original error rather than UnauthorizedException when both err and no user', () => {
      const customError = new Error('JWT malformed');

      expect(() => guard.handleRequest(customError, false)).toThrow(
        'JWT malformed',
      );
    });

    it('should throw UnauthorizedException with default message when no error and no user', () => {
      try {
        guard.handleRequest(null, false);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        expect((e as UnauthorizedException).message).toBe(
          'Authentication required',
        );
      }
    });

    it('should return user object with any shape', () => {
      const complexUser = {
        id: 'user-uuid',
        email: 'admin@example.com',
        role: 'admin',
        permissions: ['read', 'write', 'delete'],
      };

      const result = guard.handleRequest(null, complexUser);

      expect(result).toBe(complexUser);
    });
  });
});
