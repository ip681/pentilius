import { AdminRole } from '@prisma/client';

export interface AdminJwtPayload {
  sub: string;
  username: string;
  role: AdminRole;
  // AdminUser.tokenVersion at sign time — a mismatch means the token was
  // revoked (password reset, deactivation, role change).
  ver?: number;
}
