import { Injectable } from '@nestjs/common';
import { CombatRoundDto, CombatStatsDto } from '@pentilius/shared';
import { Prisma, ResearchBonusType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { ClanBonusService } from '../player/clan-bonus.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CombatStats {
  attack: number;
  defense: number;
  hp: number;
  // Fraction 0-1 (e.g. 0.1 = 10% chance to fully dodge an incoming swing).
  // Optional so Boss Hunts' aggregated partyStats (no established rule for
  // combining evasion across a party) can omit it and default to 0.
  evasion?: number;
}

/** Anything simulate() can fight: Pentili and Boss both satisfy this shape. */
export interface CombatOpponent {
  attack: number;
  defense: number;
  maxHp: number;
  evasion?: number;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly clanBonus: ClanBonusService,
  ) {}

  async computePlayerStats(playerId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<CombatStats> {
    const [player, equipped] = await Promise.all([
      tx.player.findUniqueOrThrow({ where: { id: playerId } }),
      tx.itemInstance.findMany({
        where: { playerId, equippedSlot: { not: null } },
        include: { itemDefinition: true },
      }),
    ]);

    const equippedStats = equipped.reduce<CombatStats>(
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

    // Core Attribute points (instructions/GAME_SYSTEMS.md has no prior ruling —
    // see game-config.ts's robotAttributes block).
    const stats: CombatStats = {
      attack: equippedStats.attack + player.baseDamage * GAME_BALANCE.robotAttributes.damagePointValue,
      defense: equippedStats.defense + player.baseDefense * GAME_BALANCE.robotAttributes.defensePointValue,
      hp: equippedStats.hp + player.baseHp * GAME_BALANCE.robotAttributes.hpPointValue,
    };
    const evasion =
      Math.min(GAME_BALANCE.robotAttributes.maxEvasionPercent, player.baseEvasion * GAME_BALANCE.robotAttributes.evasionPointValue) / 100;

    const [researchAttackMultiplier, hpMultiplier, clanCombatBonus] = await Promise.all([
      this.economy.getResearchMultiplier(playerId, ResearchBonusType.COMBAT_ATTACK, tx),
      this.economy.getResearchMultiplier(playerId, ResearchBonusType.COMBAT_HP, tx),
      this.clanBonus.getBonus(playerId, 'COMBAT_BONUS', tx),
    ]);
    const attackMultiplier = researchAttackMultiplier + clanCombatBonus;
    // No personal research targets defense yet — only the clan's Clan Forge does.
    const defenseMultiplier = 1 + clanCombatBonus;

    return {
      attack: stats.attack * attackMultiplier,
      defense: stats.defense * defenseMultiplier,
      hp: stats.hp * hpMultiplier,
      evasion,
    };
  }

  simulate(player: CombatStats, pentili: CombatOpponent): CombatResult {
    const playerMaxHp = Math.round(player.hp);
    const pentiliMaxHp = pentili.maxHp;

    let playerHp = playerMaxHp;
    let pentiliHp = pentiliMaxHp;
    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    const rounds: CombatRoundDto[] = [];

    for (let round = 1; round <= GAME_BALANCE.combat.maxRounds; round += 1) {
      const pentiliDodged = Math.random() < (pentili.evasion ?? 0);
      const playerDamage = pentiliDodged ? 0 : rollDamage(player.attack, pentili.defense);
      pentiliHp = Math.max(0, pentiliHp - playerDamage);
      totalDamageDealt += playerDamage;

      let pentiliDamage = 0;
      let playerDodged = false;
      if (pentiliHp > 0) {
        playerDodged = Math.random() < (player.evasion ?? 0);
        pentiliDamage = playerDodged ? 0 : rollDamage(pentili.attack, player.defense);
        playerHp = Math.max(0, playerHp - pentiliDamage);
        totalDamageTaken += pentiliDamage;
      }

      rounds.push({ round, playerDamage, pentiliDamage, playerHpAfter: playerHp, pentiliHpAfter: pentiliHp, playerDodged, pentiliDodged });

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

/** Rounds raw CombatStats for client display (PvP scout, the robot page's own summary, etc.). */
export function toStatsDto(stats: CombatStats): CombatStatsDto {
  return {
    attack: Math.round(stats.attack),
    defense: Math.round(stats.defense),
    hp: Math.round(stats.hp),
    evasion: Math.round((stats.evasion ?? 0) * 1000) / 10,
  };
}
