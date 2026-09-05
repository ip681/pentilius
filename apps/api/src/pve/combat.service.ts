import { Injectable } from '@nestjs/common';
import { CombatRoundDto } from '@pentilius/shared';
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
  rounds: CombatRoundDto[];
  playerMaxHp: number;
  pentiliMaxHp: number;
}

/**
 * Combat formula is UNDEFINED (instructions/OPEN_DECISIONS.md: "final damage
 * formula"). This is a deliberately simple, clearly-isolated placeholder so
 * Milestone 1 has a working automatic/simulated battle (LOCKED requirement in
 * instructions/GAME_SYSTEMS.md) — swap this service's internals, not its
 * callers, once the real formula is decided.
 *
 * The battle is fully resolved here, round by round, in one call — the
 * frontend only replays the returned `rounds` log with a timed animation,
 * per instructions/ARCHITECTURE.md's "frontend has no game logic" rule.
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
      { attack: 0, defense: 0, hp: GAME_BALANCE.combat.basePlayerHp },
    );
  }

  simulate(player: CombatStats, pentili: Pentili): CombatResult {
    const playerMaxHp = Math.round(player.hp);
    const pentiliMaxHp = pentili.maxHp;

    let playerHp = playerMaxHp;
    let pentiliHp = pentiliMaxHp;
    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    const rounds: CombatRoundDto[] = [];

    for (let round = 1; round <= GAME_BALANCE.combat.maxRounds; round += 1) {
      const playerDamage = rollDamage(player.attack, pentili.defense);
      pentiliHp = Math.max(0, pentiliHp - playerDamage);
      totalDamageDealt += playerDamage;

      let pentiliDamage = 0;
      if (pentiliHp > 0) {
        pentiliDamage = rollDamage(pentili.attack, player.defense);
        playerHp = Math.max(0, playerHp - pentiliDamage);
        totalDamageTaken += pentiliDamage;
      }

      rounds.push({ round, playerDamage, pentiliDamage, playerHpAfter: playerHp, pentiliHpAfter: pentiliHp });

      if (pentiliHp <= 0 || playerHp <= 0) {
        break;
      }
    }

    return {
      won: pentiliHp <= 0,
      damageDealt: totalDamageDealt,
      damageTaken: totalDamageTaken,
      rounds,
      playerMaxHp,
      pentiliMaxHp,
    };
  }
}

function rollDamage(attack: number, defense: number): number {
  const variance = 1 - GAME_BALANCE.combat.damageVariance + Math.random() * (2 * GAME_BALANCE.combat.damageVariance);
  return Math.max(1, Math.round((attack - defense * 0.5) * variance));
}
