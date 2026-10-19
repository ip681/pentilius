import { IsObject } from 'class-validator';
import { XpBalanceConfig } from '../../config/xp-balance';

export class SaveXpBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: XpBalanceConfig;
}
