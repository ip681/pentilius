import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject, IsString, MaxLength } from 'class-validator';
import { BossBalanceConfig } from '../../config/boss-balance';

/** godmaster → Bosses → test with real players: the form's boss values, the boss and up to 5 player names. */
export class BossRealTestDto {
  @IsObject()
  config!: BossBalanceConfig;

  @IsString()
  @MaxLength(100)
  bossKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  usernames!: string[];
}
