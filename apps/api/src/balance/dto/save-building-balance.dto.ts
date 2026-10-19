import { IsObject } from 'class-validator';
import { BuildingBalanceConfig } from '../../config/building-balance';

export class SaveBuildingBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: BuildingBalanceConfig;
}
