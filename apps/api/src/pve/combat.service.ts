import { Injectable } from '@nestjs/common';
import { Pentili, Prisma } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

export interface CombatStats {
  attack: number;
  defense: number;
  hp: number;
}

export interface CombatResult {
  won: boolean;
  damageDealt: number;
  damageTaken: number;
}

/**
 * Combat formula is UNDEFINED (instructions/OPEN_DECISIONS.md: "final damage
 * formula"). This is a deliberately simple, clearly-isolated placeholder so
 * Milestone 1 has a working automatic/simulated battle (LOCKED requirement in
 * instructions/GAME_SYSTEMS.md) — swap this service's internals, not its
 * callers, once the real formula is decided.
 */
@Injectable()
export class CombatService {
  constructor(private readonly prisma: PrismaService) {}

  async computePlayerStats(playerId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<CombatStats> {
    const equipped = await tx.itemInstance.findMany({
      where: { playerId, equippedSlot: { not: null } },
      include: { itemDefinition: true },
    });

    return equipped.reduce<CombatStats>(
      (stats, item) => {
        const baseStats = item.itemDefinition.baseStats as Partial<CombatStats>;
        const multiplier = 1 + item.upgradeLevel * GAME_BALANCE.combat.bonusPerUpgradeLevel;
        return {
          attack: stats.attack + (baseStats.attack ?? 0) * multiplier,
          defense: stats.defense + (baseStats.defense ?? 0) * multiplier,
          hp: stats.hp + (baseStats.hp ?? 0) * multiplier,
        };
      },
      { attack: 0, defense: 0, hp: 0 },
    );
  }

  simulate(player: CombatStats, pentili: Pentili): CombatResult {
    const playerPower = player.attack + player.defense + player.hp;
    const pentiliPower = pentili.attack + pentili.defense + pentili.maxHp;
    const winProbability = playerPower / (playerPower + pentiliPower || 1);
    const won = Math.random() < winProbability;

    if (won) {
      return {
        won: true,
        damageDealt: pentili.maxHp,
        damageTaken: Math.max(0, Math.round(pentili.attack - player.defense)),
      };
    }

    return {
      won: false,
      damageDealt: Math.min(pentili.maxHp - 1, Math.max(0, Math.round(player.attack))),
      damageTaken: Math.round(pentili.attack),
    };
  }
}
