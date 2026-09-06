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
      { attack: 0, defense: 0, hp: GAME_BALANCE.combat.basePlayerHp, increaseDamage: 0, increaseMaxHp: 0, criticalDamageBonus: 0, damageDecrease: 0, damageReflect: 0 },
    );

    // Core Attribute points (instructions/GAME_SYSTEMS.md has no prior ruling —
    // see game-config.ts's robotAttributes block).
    const stats = {
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
    const attackMultiplier = researchAttackMultiplier + clanCombatBonus + equippedStats.increaseDamage;
    // No personal research targets defense yet — only the clan's Clan Forge does.
    const defenseMultiplier = 1 + clanCombatBonus;

    return {
      attack: stats.attack * attackMultiplier,
      defense: stats.defense * defenseMultiplier,
      hp: stats.hp * (hpMultiplier + equippedStats.increaseMaxHp),
      evasion,
      criticalDamageBonus: equippedStats.criticalDamageBonus,
      damageDecrease: equippedStats.damageDecrease,
      damageReflect: equippedStats.damageReflect,
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
