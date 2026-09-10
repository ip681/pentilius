import { Race } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateJoinRequirementsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  minLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minDamage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minDefense?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minHp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minEvasion?: number;

  // Empty array = no restriction (every race allowed).
  @IsOptional()
  @IsArray()
  @IsEnum(Race, { each: true })
  allowedRaces?: Race[];
}
