import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BanPlayerDto {
  @IsString()
  username!: string;

  @IsInt()
  @Min(1)
  @Max(87600) // 10 years — generous ceiling, not a real-world limit
  durationHours!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
