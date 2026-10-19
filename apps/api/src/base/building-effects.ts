import { BuildingType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';

/**
 * Per-level building effects that don't grow in a straight line (base balance,
 * 2026-10-14). Shared by the Base screen and the systems that apply them, so
 * the number shown is always the number used.
 */

// The mines' production growth — set from the buildings balance in godmaster
// (owner decision, 2026-10-19) when the API starts and on every save, so these
// effects keep following production.
let productionGrowth: number = GAME_BALANCE.buildingEffects.amountGrowth;
export function setProductionGrowth(growth: number): void {
  productionGrowth = growth;
}

/** Grows like mine production (perLevel * level * growth^(level-1)), so it stays worth the same number of hours of income. */
export function productionScaled(level: number, perLevel: number | null): number {
  if (!perLevel || level <= 0) return 0;
  return Math.round(perLevel * level * Math.pow(productionGrowth, level - 1));
}

/** Market listings: a fraction per level, rounded up, so level 1 already allows one listing. */
export function marketSlots(level: number, perLevel: number | null): number {
  if (!perLevel || level <= 0) return 0;
  return Math.ceil(level * perLevel - 1e-9);
}

/** Hideout: Metal and Crystal follow production. Credits can't be stolen (2026-10-19), so the Hideout doesn't guard them. */
export function hideoutProtection(level: number, type: BuildingType): { metal: number; crystal: number; credits: number } {
  return {
    metal: productionScaled(level, type.protectedMetalPerLevel),
    crystal: productionScaled(level, type.protectedCrystalPerLevel),
    credits: 0,
  };
}
