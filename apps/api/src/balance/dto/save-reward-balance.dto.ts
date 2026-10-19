import { IsObject } from 'class-validator';
import { RewardBalanceConfig } from '../../config/reward-balance';

export class SaveRewardBalanceDto {
  // Checked field by field in AdminBalanceService (ranges, items), not here.
  @IsObject()
  config!: RewardBalanceConfig;
}
