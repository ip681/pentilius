import { Matches, IsString } from 'class-validator';

export class RenamePlayerDto {
  @IsString()
  username!: string;

  // Same rule as registration (auth/dto/register.dto.ts) — letters, digits, underscores only.
  @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  newUsername!: string;
}
