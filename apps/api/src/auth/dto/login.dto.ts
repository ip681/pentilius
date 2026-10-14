import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // Email or username (owner decision, 2026-10-14). Usernames can't contain
  // "@", so the server tells them apart.
  @IsOptional()
  @IsString()
  @MaxLength(254)
  login?: string;

  // Older clients (a page loaded before the change) still send `email`.
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsString()
  password!: string;
}
