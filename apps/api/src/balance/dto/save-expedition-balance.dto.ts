import { IsObject } from 'class-validator';
import { ExpeditionBalanceConfig } from '../../config/expedition-balance';

export class SaveExpeditionBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: ExpeditionBalanceConfig;
}
