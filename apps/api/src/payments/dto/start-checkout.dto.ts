import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartCheckoutDto {
  @IsString()
  @MaxLength(64)
  productKey!: string;

  // The language of Stripe's payment page and of the page the player returns to.
  @IsOptional()
  @IsIn(['bg', 'en'])
  locale?: 'bg' | 'en';
}
