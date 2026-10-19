import { ClanBuilding, Prisma } from '@prisma/client';
import { productionScaled } from '../base/building-effects';
import { clanRuntime } from '../config/clan-balance';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

/**
 * Tavern activation (owner decision, 2026-10-12). One activation lasts
 * the clan balance's tavern.activationHours (godmaster) and is NOT renewed automatically —
 * once activeUntil passes the Tavern is simply inactive until a leader/officer
 * activates it again by hand. Plain functions rather than
 * a service so both ClansService and PlayerModule's ClanBonusService can use
 * them without a circular module import (same reason ClanBonusService lives
 * in PlayerModule).
 */

export interface TavernActivationCost {
  metal: number;
  crystal: number;
  credits: number;
}

// Activation cost and length come from the clan balance in godmaster (2026-10-19).
export function tavernActivationCost(level: number): TavernActivationCost {
  const t = clanRuntime().tavern;
  return {
    metal: productionScaled(level, t.activationMetal),
    crystal: productionScaled(level, t.activationCrystal),
    credits: productionScaled(level, t.activationCredits),
  };
}

export function tavernActivationMs(): number {
  return clanRuntime().tavern.activationHours * 3600_000;
}

export function findTavern(clanId: string, tx: Tx): Promise<ClanBuilding | null> {
  return tx.clanBuilding.findFirst({ where: { clanId, clanBuildingType: { bonusType: 'BOSS_CORE_DAMAGE' } } });
}

/**
 * Charges the treasury for one activation. Conditional decrement so two
 * concurrent callers can never overdraw it — returns false if it couldn't pay.
 */
export async function chargeTavernActivation(clanId: string, level: number, tx: Tx): Promise<boolean> {
  const cost = tavernActivationCost(level);
  const charged = await tx.clan.updateMany({
    where: {
      id: clanId,
      treasuryMetal: { gte: cost.metal },
      treasuryCrystal: { gte: cost.crystal },
      treasuryCredits: { gte: cost.credits },
    },
    data: {
      treasuryMetal: { decrement: cost.metal },
      treasuryCrystal: { decrement: cost.crystal },
      treasuryCredits: { decrement: cost.credits },
    },
  });
  return charged.count === 1;
}

export function isTavernActive(tavern: Pick<ClanBuilding, 'level' | 'activeUntil'> | null): boolean {
  return !!tavern && tavern.level > 0 && !!tavern.activeUntil && tavern.activeUntil.getTime() > Date.now();
}

