import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class SavePaymentProductDto {
  // Stable identity, e.g. "credits_1200" — never shown to players.
  @Matches(/^[a-z0-9_]{3,40}$/)
  key!: string;

  // Optional custom names (special offers); empty = the translated template.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameBg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameEn?: string;

  // Price in euro cents; a change creates a new Stripe price (Stripe's minimum is 0.50 EUR).
  @IsOptional()
  @IsInt()
  @Min(50)
  priceCents?: number;

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

  // Link an existing Stripe price instead of creating one (advanced).
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
