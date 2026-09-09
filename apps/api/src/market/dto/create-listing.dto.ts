import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateListingDto {
  @IsString()
  itemInstanceId!: string;

  @IsInt()
  @Min(0)
  priceMetal!: number;

  @IsInt()
  @Min(0)
  priceCrystal!: number;

  @IsInt()
  @Min(0)
  priceCredits!: number;

  @IsOptional()
  @IsBoolean()
  visibleToClanOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  visibleToFriendsOnly?: boolean;
}
