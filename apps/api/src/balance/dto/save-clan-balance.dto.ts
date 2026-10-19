import { IsObject } from 'class-validator';
import { ClanBalanceConfig } from '../../config/clan-balance';

export class SaveClanBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: ClanBalanceConfig;
}
