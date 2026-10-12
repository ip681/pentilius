import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class CorePlayerRankingQueryDto {
  @IsIn(['clan', 'server'])
  scope!: 'clan' | 'server';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
