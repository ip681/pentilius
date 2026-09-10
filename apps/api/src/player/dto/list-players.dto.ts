import { Race } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListPlayersDto {
  @IsOptional()
  @IsEnum(Race)
  race?: Race;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  search?: string;

  @IsOptional()
  @IsIn(['level', 'pvpWins', 'clanWarDamage'])
  sortBy?: 'level' | 'pvpWins' | 'clanWarDamage';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
