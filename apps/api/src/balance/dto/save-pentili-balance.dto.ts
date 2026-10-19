import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PentiliBalanceConfig } from '../../config/pentili-balance';

export class PentiliOwnSettingsDto {
  @Matches(/^[a-z0-9_]{1,60}$/)
  key!: string;

  // Fixed level instead of the zone's start + place × step.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  levelOverride?: number | null;

  @IsNumber()
  @Min(0.1)
  @Max(10)
  strength!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  specialItemKey?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  specialItemChance?: number | null;
}

export class SavePentiliBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: PentiliBalanceConfig;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PentiliOwnSettingsDto)
  pentili!: PentiliOwnSettingsDto[];
}
