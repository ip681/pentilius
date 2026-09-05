import { Injectable } from '@nestjs/common';
import { PlayerProfileDto } from '@pentilius/shared';
import { EconomyService } from './economy.service';

@Injectable()
export class PlayerService {
  constructor(private readonly economy: EconomyService) {}

  async getProfile(playerId: string): Promise<PlayerProfileDto> {
    const player = await this.economy.settleAll(playerId);
    const xpForNextLevel = await this.economy.getXpForNextLevel(player.level);

    return {
      id: player.id,
      email: player.email,
      username: player.username,
      race: player.race,
      level: player.level,
      xp: player.xp,
      xpForNextLevel,
      resources: {
        metal: player.metal,
        crystal: player.crystal,
        oxygen: player.oxygen,
        credits: player.credits,
        upgradeStones: player.upgradeStones,
      },
      energy: {
        current: player.actionEnergy,
        max: player.actionEnergyMax,
      },
    };
  }
}
