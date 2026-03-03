import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@marketplace/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('No authenticated user found');
    }

    const hasRole = requiredRoles.includes(user.role as UserRole);

    if (!hasRole) {
      this.logger.warn({
        message: 'Access denied — insufficient role',
        userId: user.id,
        userRole: user.role,
        requiredRoles,
        correlationId: request.headers['x-correlation-id'] ?? 'unknown',
      });
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
