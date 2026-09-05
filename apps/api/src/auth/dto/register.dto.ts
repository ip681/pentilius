import { Race } from '@prisma/client';
import { IsEmail, IsEnum, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // Public in-game identity — kept distinct from email, which is never shown
  // to other players. Letters, digits and underscores only, so it is always
  // safe to display as-is.
  @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  username!: string;

  @MinLength(8)
  password!: string;

  @IsEnum(Race)
  race!: Race;
}
