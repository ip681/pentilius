import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ItemQuality } from '@prisma/client';

export class GrantItemDto {
  @IsString()
  username!: string;

  @IsString()
  itemDefinitionKey!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  // Only meaningful for EQUIPMENT (grantItem ignores it for CONSUMABLE, which
  // has no quality concept) — omitted means "roll normally" (today's random
  // Normal/Rare behavior), same as every non-admin grant path.
  @IsOptional()
  @IsEnum(ItemQuality)
  quality?: ItemQuality;
}
