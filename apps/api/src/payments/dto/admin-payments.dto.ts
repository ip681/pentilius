import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class SavePaymentProductDto {
  // Stable identity, e.g. "credits_1200" — never shown to players.
  @Matches(/^[a-z0-9_]{3,40}$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nameBg!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nameEn!: string;

  @IsIn(['CREDITS', 'VIP'])
  kind!: 'CREDITS' | 'VIP';

  @IsOptional()
  @IsInt()
  @Min(1)
  credits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  vipDays?: number;

  // Empty = not offered yet.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  stripePriceId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePaymentsSettingsDto {
  // Two-letter country codes, e.g. ["BG"].
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  allowedCountries!: string[];
}
