import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateClanDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  name!: string;

  // Classic short clan tag — letters and digits only.
  @Matches(/^[a-zA-Z0-9]{2,5}$/)
  tag!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;
}
