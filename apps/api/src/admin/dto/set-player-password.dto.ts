import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetPlayerPasswordDto {
  @IsString()
  username!: string;

  // Same minimum as registration.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
