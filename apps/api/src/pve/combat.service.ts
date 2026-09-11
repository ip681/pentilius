import { Injectable } from '@nestjs/common';
import { CombatRoundDto, CombatStatsDto } from '@pentilius/shared';
import { ItemOption, Prisma, ResearchBonusType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { ClanBonusService } from '../player/clan-bonus.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CombatStats {
  attack: number;
  defense: number;
  hp: number;
  // All of the below are fractions (e.g. 0.1 = 10%). Optional so Boss Hunts'
  // aggregated partyStats can omit them — there's no established rule for
  // combining evasion/crit/decrease/reflect across a party, so boss.service.ts
  // deliberately leaves them unaggregated (see computePartyAggregate).
  evasion?: number;
  // Sum of equipped items' rolled CRITICAL_DAMAGE options, added on top of
  // GAME_BALANCE.combat.criticalMultiplier when this side lands a crit.
  criticalDamageBonus?: number;
  // Sum of equipped items' rolled DAMAGE_DECREASE options — reduces incoming damage.
  damageDecrease?: number;
  // Sum of equipped items' rolled DAMAGE_REFLECT options — bounces that % of
  // incoming damage back onto whoever dealt it.
  damageReflect?: number;
}

/** Anything simulate() can fight: Pentili and Boss both satisfy this shape. */
export interface CombatOpponent {
  attack: number;
  defense: number;
  maxHp: number;
  // Pentili/Boss never set these today (no equipped gear) — present so a
  // future elite monster design could, and so resolveHit() can share one
  // signature for either side of a hit.
  evasion?: number;
  criticalDamageBonus?: number;
  damageDecrease?: number;
  damageReflect?: number;
}

export interface CombatResult {
  won: boolean;
  damageDealt: number;
  damageTaken: number;
  rounds: CombatRoundDto[];
  playerMaxHp: number;
  pentiliMaxHp: number;
}

interface EquippedAccumulator {
  attack: number;
  defense: number;
  hp: number;
  increaseDamage: number;
  increaseMaxHp: number;
  criticalDamageBonus: number;
  damageDecrease: number;
  damageReflect: number;
}

/**
 * One player's combat inputs BEFORE the final combine step — split out so
 * Boss Formations (boss-formations.service.ts) can sum raw stats and Excellent-
 * option percentages ACROSS every filled slot before applying them once to the
 * formation's combined total, instead of each player's own options only ever
 * affecting their own stat (see aggregateFormationCombatStats below). Solo
 * combat (PvE/PvP/Clan War) keeps using computePlayerStats, which is now a
 * thin wrapper around this + combineBreakdown — bit-identical output.
 */
export interface PlayerCombatBreakdown {
  // Equipment (upgrade-scaled) + Core Attribute points — no multipliers, no options.
  base: { attack: number; defense: number; hp: number };
  attackFactor: number; // researchAttackMultiplier + clanCombatBonus (excludes increaseDamage)
  defenseFactor: number; // 1 + clanCombatBonus (no research/option targets defense yet)
  hpFactor: number; // researchHpMultiplier alone (excludes increaseMaxHp)
  optionTotals: {
    increaseDamage: number;
    increaseMaxHp: number;
    criticalDamageBonus: number;
    damageDecrease: number;
    damageReflect: number;
  };
  evasion: number;
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
    const breakdown = await this.computeCombatBreakdown(playerId, tx);
    return combineBreakdown(breakdown);
  }

  async computeCombatBreakdown(playerId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<PlayerCombatBreakdown> {
    const [player, equipped] = await Promise.all([
      tx.player.findUniqueOrThrow({ where: { id: playerId } }),
      tx.itemInstance.findMany({
        where: { playerId, equippedSlot: { not: null } },
        include: { itemDefinition: true },
      }),
    ]);

    const equippedStats = equipped.reduce<EquippedAccumulator>(
      (stats, item) => {
        const baseStats = item.itemDefinition.baseStats as Partial<{ attack: number; defense: number; hp: number }>;
        const multiplier = 1 + item.upgradeLevel * GAME_BALANCE.combat.bonusPerUpgradeLevel;
        const next: EquippedAccumulator = {
          ...stats,
          attack: stats.attack + (baseStats.attack ?? 0) * multiplier,
          defense: stats.defense + (baseStats.defense ?? 0) * multiplier,
          hp: stats.hp + (baseStats.hp ?? 0) * multiplier,
        };
        for (const option of item.rolledOptions) {
          addOption(next, option);
        }
        return next;
      },
      {
        attack: GAME_BALANCE.combat.baseAttack,
        defense: GAME_BALANCE.combat.baseDefense,
        hp: GAME_BALANCE.combat.basePlayerHp,
        increaseDamage: 0,
        increaseMaxHp: 0,
        criticalDamageBonus: 0,
        damageDecrease: 0,
        damageReflect: 0,
      },
    );

    // Core Attribute points (instructions/GAME_SYSTEMS.md has no prior ruling —
    // see game-config.ts's robotAttributes block).
    const base = {
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

    return {
      base,
      attackFactor: researchAttackMultiplier + clanCombatBonus,
      // No personal research targets defense yet — only the clan's Clan Forge does.
      defenseFactor: 1 + clanCombatBonus,
      hpFactor: hpMultiplier,
      optionTotals: {
        increaseDamage: equippedStats.increaseDamage,
        increaseMaxHp: equippedStats.increaseMaxHp,
        criticalDamageBonus: equippedStats.criticalDamageBonus,
        damageDecrease: equippedStats.damageDecrease,
        damageReflect: equippedStats.damageReflect,
      },
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
      const playerHit = pentiliDodged ? NO_HIT : resolveHit(player, pentili);
      pentiliHp = Math.max(0, pentiliHp - playerHit.damage);
      playerHp = Math.max(0, playerHp - playerHit.reflected);
      totalDamageDealt += playerHit.damage;

      let pentiliHit = NO_HIT;
      let playerDodged = false;
      if (pentiliHp > 0 && playerHp > 0) {
        playerDodged = Math.random() < (player.evasion ?? 0);
        pentiliHit = playerDodged ? NO_HIT : resolveHit(pentili, player);
        playerHp = Math.max(0, playerHp - pentiliHit.damage);
        pentiliHp = Math.max(0, pentiliHp - pentiliHit.reflected);
        totalDamageTaken += pentiliHit.damage;
      }

      rounds.push({
        round,
        playerDamage: playerHit.damage,
        pentiliDamage: pentiliHit.damage,
        playerHpAfter: playerHp,
        pentiliHpAfter: pentiliHp,
        playerDodged,
        pentiliDodged,
        playerCritical: playerHit.critical,
        pentiliCritical: pentiliHit.critical,
        playerReflectedDamage: playerHit.reflected,
        pentiliReflectedDamage: pentiliHit.reflected,
      });

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

/** Reproduces computePlayerStats' original combine formula exactly, bit-for-bit — solo combat only. */
function combineBreakdown(b: PlayerCombatBreakdown): CombatStats {
  return {
    attack: b.base.attack * (b.attackFactor + b.optionTotals.increaseDamage),
    defense: b.base.defense * b.defenseFactor,
    hp: b.base.hp * (b.hpFactor + b.optionTotals.increaseMaxHp),
    evasion: b.evasion,
    criticalDamageBonus: b.optionTotals.criticalDamageBonus,
    damageDecrease: b.optionTotals.damageDecrease,
    damageReflect: b.optionTotals.damageReflect,
  };
}

/**
 * Boss Formations only (owner decision, 2026-09-11): raw stats are summed
 * across every filled slot (each still carrying its own per-player
 * attackFactor/defenseFactor/hpFactor, since research/clan levels can differ
 * per player), THEN Excellent-option percentages are summed across every
 * filled slot and applied ONCE to the combined total — deliberately stronger
 * than solo combat's per-player-then-summed model (see combineBreakdown
 * above), since here every player's % now multiplies the whole party's total
 * instead of only their own share. DAMAGE_REFLECT is excluded entirely — kept
 * a PvP-only mechanic going forward. Evasion has no established aggregation
 * rule (the old Boss Hunts model never aggregated it either) — averaged
 * across filled slots as a simple placeholder.
 */
export function aggregateFormationCombatStats(breakdowns: PlayerCombatBreakdown[]): CombatStats {
  const rawAttack = sumBy(breakdowns, (b) => b.base.attack * b.attackFactor);
  const rawDefense = sumBy(breakdowns, (b) => b.base.defense * b.defenseFactor);
  const rawHp = sumBy(breakdowns, (b) => b.base.hp * b.hpFactor);
  const increaseDamage = sumBy(breakdowns, (b) => b.optionTotals.increaseDamage);
  const increaseMaxHp = sumBy(breakdowns, (b) => b.optionTotals.increaseMaxHp);
  const criticalDamageBonus = sumBy(breakdowns, (b) => b.optionTotals.criticalDamageBonus);
  const damageDecrease = Math.min(GAME_BALANCE.bossFormations.maxDamageDecrease, sumBy(breakdowns, (b) => b.optionTotals.damageDecrease));
  const evasion = breakdowns.length > 0 ? sumBy(breakdowns, (b) => b.evasion) / breakdowns.length : 0;

  return {
    attack: rawAttack * (1 + increaseDamage),
    defense: rawDefense,
    hp: rawHp * (1 + increaseMaxHp),
    evasion,
    criticalDamageBonus,
    damageDecrease,
    damageReflect: 0,
  };
}

function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((sum, item) => sum + fn(item), 0);
}

function addOption(acc: EquippedAccumulator, option: ItemOption): void {
  const value = GAME_BALANCE.itemOptionValues[option];
  if (option === 'INCREASE_DAMAGE') acc.increaseDamage += value;
  else if (option === 'INCREASE_MAX_HP') acc.increaseMaxHp += value;
  else if (option === 'CRITICAL_DAMAGE') acc.criticalDamageBonus += value;
  else if (option === 'DAMAGE_DECREASE') acc.damageDecrease += value;
  else if (option === 'DAMAGE_REFLECT') acc.damageReflect += value;
}

interface HitResult {
  damage: number;
  reflected: number;
  critical: boolean;
}

const NO_HIT: HitResult = { damage: 0, reflected: 0, critical: false };

/** One attacker-vs-defender exchange: base damage, then crit, then the defender's decrease/reflect. */
function resolveHit(
  attacker: { attack: number; criticalDamageBonus?: number },
  defender: { defense: number; damageDecrease?: number; damageReflect?: number },
): HitResult {
  const variance = 1 - GAME_BALANCE.combat.damageVariance + Math.random() * (2 * GAME_BALANCE.combat.damageVariance);
  let damage = (attacker.attack - defender.defense * 0.5) * variance;

  const critical = Math.random() < GAME_BALANCE.combat.criticalChance;
  if (critical) {
    damage *= GAME_BALANCE.combat.criticalMultiplier + (attacker.criticalDamageBonus ?? 0);
  }

  damage *= 1 - (defender.damageDecrease ?? 0);
  damage = Math.max(1, Math.round(damage));

  const reflected = Math.round(damage * (defender.damageReflect ?? 0));
  return { damage, reflected, critical };
}

/** Rounds raw CombatStats for client display (PvP scout, the robot page's own summary, etc.). */
export function toStatsDto(stats: CombatStats): CombatStatsDto {
  return {
    attack: Math.round(stats.attack),
    defense: Math.round(stats.defense),
    hp: Math.round(stats.hp),
    evasion: Math.round((stats.evasion ?? 0) * 1000) / 10,
    criticalDamageBonus: Math.round((stats.criticalDamageBonus ?? 0) * 1000) / 10,
    damageDecrease: Math.round((stats.damageDecrease ?? 0) * 1000) / 10,
    damageReflect: Math.round((stats.damageReflect ?? 0) * 1000) / 10,
  };
}
