import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminJwtPayload } from '../admin-jwt-payload.interface';

/** Reads the authenticated admin from the request, populated by AdminJwtAuthGuard. */
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminJwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
