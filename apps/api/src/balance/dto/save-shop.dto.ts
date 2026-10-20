import { IsArray } from 'class-validator';
import { SaveShopItemDto } from '@pentilius/shared';

export class SaveShopDto {
  // Checked item by item in AdminBalanceService (known keys, whole non-negative prices), not here.
  @IsArray()
  items!: SaveShopItemDto[];
}
