import { AdminRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAdminRoleDto {
  @IsEnum(AdminRole)
  role!: AdminRole;
}
