import { BossParticipantDto } from '@pentilius/shared';
import { IsNumber, IsObject, IsOptional } from 'class-validator';
import { BossBalanceConfig } from '../../config/boss-balance';

export class SaveBossBalanceDto {
  // Checked field by field in AdminBalanceService (ranges), not here.
  @IsObject()
  config!: BossBalanceConfig;

  // Preview only (never saved): each boss's example participant, how many of
  // them the suggestion and rewards are for, and the win share (0-1) to
  // suggest the strength for. Checked in AdminBalanceService.
  @IsOptional()
  @IsObject()
  participants?: Record<string, BossParticipantDto>;

  @IsOptional()
  @IsNumber()
  players?: number;

  @IsOptional()
  @IsNumber()
  target?: number;
}
