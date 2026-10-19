import { EquipmentSplitDto } from '@pentilius/shared';
import { IsNumber, IsObject, IsOptional } from 'class-validator';
import { BossBalanceConfig } from '../../config/boss-balance';

export class SaveBossBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: BossBalanceConfig;

  // Preview only (never saved): the reference robots' points split and bonuses,
  // and the Cantina's bonus (a fraction).
  @IsOptional()
  @IsObject()
  split?: EquipmentSplitDto;

  @IsOptional()
  @IsNumber()
  tavern?: number;
}
