import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeAdminPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}
