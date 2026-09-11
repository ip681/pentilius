import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

/**
 * Shared across every combat action (PvE, PvP, Bosses, Clan War) — owner
 * decision, 2026-09-11: a robot "away" on an expedition can't also fight,
 * so an expedition should cost real opportunity, not just run as a free
 * bonus alongside normal grinding. Equip/unequip stays unrestricted — the
 * combat block alone already removes the exploitable advantage.
 */
export async function assertNoActiveExpedition(playerId: string, tx: Tx): Promise<void> {
  const active = await tx.playerExpedition.findFirst({ where: { playerId, claimedAt: null } });
  if (active) {
    throw new BadRequestException('EXPEDITION_IN_PROGRESS');
  }
}
