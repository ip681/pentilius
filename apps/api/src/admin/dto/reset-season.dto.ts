import { IsInt, IsString, Min } from 'class-validator';

export class ResetSeasonDto {
  // Must equal the number the NEW season will get — a typed confirmation.
  @IsInt()
  @Min(2)
  newSeasonNumber!: number;

  @IsString()
  password!: string;
}
