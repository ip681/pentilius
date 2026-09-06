import { Race } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPlayersDto {
  @IsOptional()
  @IsEnum(Race)
  race?: Race;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  search?: string;
}
