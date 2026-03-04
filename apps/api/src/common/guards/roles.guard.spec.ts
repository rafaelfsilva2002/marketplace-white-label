import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@marketplace/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockExecutionContext(
  user?: { id: string; email: string; role: string },
  correlationId?: string,
): ExecutionContext {
  const request: Record<string, unknown> = {
    headers: {
      'x-correlation-id': correlationId ?? 'test-correlation-id',
    },
  };
  if (user) {
    request.user = user;
  }

  return {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
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

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  // -------------------------------------------------------------------------
  // No roles specified (public endpoint)
  // -------------------------------------------------------------------------

  describe('when no roles are required', () => {
    it('should allow access when @Roles() is not set (undefined)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockExecutionContext();

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when @Roles() returns an empty array', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const context = createMockExecutionContext();

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Matching roles
  // -------------------------------------------------------------------------

  describe('when user has matching role', () => {
    it('should allow access for a user with the exact required role', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.Admin,
      ]);
      const context = createMockExecutionContext({
        id: 'user-1',
        email: 'admin@example.com',
        role: UserRole.Admin,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when user role matches one of multiple required roles', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.Admin,
        UserRole.Moderator,
      ]);
      const context = createMockExecutionContext({
        id: 'user-2',
        email: 'mod@example.com',
        role: UserRole.Moderator,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow Professional role when it is in the required list', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.Professional,
        UserRole.User,
      ]);
      const context = createMockExecutionContext({
        id: 'pro-1',
        email: 'pro@example.com',
        role: UserRole.Professional,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Non-matching roles
  // -------------------------------------------------------------------------

  describe('when user does not have matching role', () => {
    it('should throw ForbiddenException when user role is not in required roles', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.Admin,
      ]);
      const context = createMockExecutionContext({
        id: 'user-3',
        email: 'regular@example.com',
        role: UserRole.User,
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should include required roles in the error message', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.Admin,
        UserRole.Moderator,
      ]);
      const context = createMockExecutionContext({
        id: 'user-4',
        email: 'user@example.com',
        role: UserRole.User,
      });

      expect(() => guard.canActivate(context)).toThrow(
        'Access denied. Required roles: admin, moderator',
      );
    });

    it('should deny Professional user when only Admin is allowed', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.Admin,
      ]);
      const context = createMockExecutionContext({
        id: 'pro-2',
        email: 'pro@example.com',
        role: UserRole.Professional,
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // No authenticated user
  // -------------------------------------------------------------------------

  describe('when no user is on the request', () => {
    it('should throw ForbiddenException when request.user is undefined', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.User,
      ]);
      const context = createMockExecutionContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'No authenticated user found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Reflector key usage
  // -------------------------------------------------------------------------

  describe('reflector usage', () => {
    it('should call reflector.getAllAndOverride with ROLES_KEY', () => {
      const spy = vi
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(undefined);
      const context = createMockExecutionContext();

      guard.canActivate(context);

      expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });
});
