import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../jwt-payload.interface';

/**
 * Reads the authenticated player from the request, populated by JwtAuthGuard.
 * Milestone 1 modules (base, robot, inventory, pve) reuse this instead of
 * trusting any player id passed in the request body.
 */
export const CurrentPlayer = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
