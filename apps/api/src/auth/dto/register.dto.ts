import { Race } from '@prisma/client';
import { Equals, IsEmail, IsEnum, IsIn, IsOptional, Matches, MinLength } from 'class-validator';

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

  // Must be explicitly true — the "I accept the Rules and Privacy Policy and
  // confirm the minimum age" checkbox (app-store requirement, 2026-10-12).
  @Equals(true)
  acceptedTerms!: boolean;

  // Language of the confirmation email (the page's locale).
  @IsOptional()
  @IsIn(['bg', 'en'])
  locale?: 'bg' | 'en';
}
