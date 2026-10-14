import { BuildingType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';

/**
 * Per-level building effects that don't grow in a straight line (base balance,
 * 2026-10-14). Shared by the Base screen and the systems that apply them, so
 * the number shown is always the number used.
 */

/** Grows like mine production (perLevel * level * growth^(level-1)), so it stays worth the same number of hours of income. */
export function productionScaled(level: number, perLevel: number | null): number {
  if (!perLevel || level <= 0) return 0;
  return Math.round(perLevel * level * Math.pow(GAME_BALANCE.buildingEffects.amountGrowth, level - 1));
}

/** Market listings: a fraction per level, rounded up, so level 1 already allows one listing. */
export function marketSlots(level: number, perLevel: number | null): number {
  if (!perLevel || level <= 0) return 0;
  return Math.ceil(level * perLevel - 1e-9);
}

/** Hideout: Metal and Crystal follow production; Credits don't come from buildings, so they stay linear. */
export function hideoutProtection(level: number, type: BuildingType): { metal: number; crystal: number; credits: number } {
  return {
    metal: productionScaled(level, type.protectedMetalPerLevel),
    crystal: productionScaled(level, type.protectedCrystalPerLevel),
    credits: level > 0 ? level * (type.protectedCreditsPerLevel ?? 0) : 0,
  };
}
