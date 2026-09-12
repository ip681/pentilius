import { AdminRole } from '@prisma/client';
import { IsEnum, Matches } from 'class-validator';

export class CreateAdminDto {
  // Same shape as a player username (auth/dto/register.dto.ts) — no strong reason to differ.
  @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  username!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;
}
