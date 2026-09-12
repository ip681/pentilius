import { AdminRole } from '@prisma/client';

export interface AdminJwtPayload {
  sub: string;
  username: string;
  role: AdminRole;
}
