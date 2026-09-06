import { IsInt, IsOptional, Min } from 'class-validator';

export class DonateDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  metal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  crystal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  credits?: number;
}
