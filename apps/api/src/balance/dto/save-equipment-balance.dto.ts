import { IsObject, IsOptional } from 'class-validator';
import { EquipmentSplitDto } from '@pentilius/shared';
import { EquipmentBalanceConfig } from '../../config/equipment-balance';

export class SaveEquipmentBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: EquipmentBalanceConfig;

  // Preview only: how the reference robot spends its attribute points
  // (shares) and its research/Forge bonuses (fractions). Never saved.
  @IsOptional()
  @IsObject()
  split?: EquipmentSplitDto;
}
