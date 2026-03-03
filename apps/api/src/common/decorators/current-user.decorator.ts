import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | string => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtUser = request.user;

    if (data) {
      return user[data];
    }
    return user;
  },
);
