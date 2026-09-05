import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BossDto,
  BossEncounterDto,
  BossEncounterParticipantDto,
  BossEncounterResultDto,
  LootResultEntryDto,
  ResourceType,
} from '@pentilius/shared';
import { Boss, BossEncounter, BossEncounterParticipant, BossLootDrop, Player, Prisma, Zone } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { CombatService } from '../pve/combat.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

const RESOURCE_FIELD: Record<ResourceType, 'metal' | 'crystal' | 'oxygen' | 'credits' | 'upgradeStones'> = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  OXYGEN: 'oxygen',
  CREDITS: 'credits',
  UPGRADE_STONES: 'upgradeStones',
};

type Tx = PrismaService | Prisma.TransactionClient;
type EncounterWithParticipants = BossEncounter & { participants: (BossEncounterParticipant & { player: Player })[] };

/**
 * Boss Hunts (instructions/GAME_SYSTEMS.md, LOCKED direction). Clans
 * (Milestone 4) don't exist yet, so joining is an open lobby per zone rather
 * than an invite system — see instructions/OPEN_DECISIONS.md and the schema
 * comment on the Boss models for the full reasoning.
 */
@Injectable()
export class BossService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
  ) {}

  async getBosses(playerId: string): Promise<BossDto[]> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const bosses = await this.prisma.boss.findMany({ include: { zone: true }, orderBy: { level: 'asc' } });

    const result: BossDto[] = [];
    for (const boss of bosses) {
      await this.finalizeIfExpired(boss.id);
      const encounter = await this.loadLatestEncounter(boss.id);
      result.push(toBossDto(boss, boss.zone, player, encounter));
    }
    return result;
  }

  async joinEncounter(playerId: string, bossKey: string): Promise<BossDto> {
    const player = await this.economy.settleAll(playerId);

    return this.prisma.$transaction(async (tx) => {
      const boss = await tx.boss.findUnique({ where: { key: bossKey }, include: { zone: true } });
      if (!boss) {
        throw new NotFoundException('Boss not found');
      }
      if (player.level < boss.zone.unlockLevel) {
        throw new ForbiddenException('Zone is locked');
      }
      if (player.actionEnergy < 1) {
        throw new BadRequestException('Not enough Action Energy');
      }

      await this.finalizeIfExpired(boss.id, tx);
      let encounter = await this.loadLatestEncounter(boss.id, tx);
      if (!encounter || encounter.status === 'RESOLVED') {
        encounter = await this.openNewEncounter(boss, tx);
      }
      if (encounter.participants.some((p) => p.playerId === playerId)) {
        throw new BadRequestException('Already joined this encounter');
      }

      await tx.player.update({ where: { id: playerId }, data: { actionEnergy: { decrement: 1 } } });
      await tx.bossEncounterParticipant.create({ data: { encounterId: encounter.id, playerId } });

      const updatedPlayer = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const refreshed = await this.loadLatestEncounter(boss.id, tx);
      return toBossDto(boss, boss.zone, updatedPlayer, refreshed!);
    });
  }

  async resolveEncounter(playerId: string, bossKey: string): Promise<BossEncounterResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const boss = await tx.boss.findUnique({ where: { key: bossKey }, include: { zone: true, lootDrops: true } });
      if (!boss) {
        throw new NotFoundException('Boss not found');
      }

      const encounter = await this.loadLatestEncounter(boss.id, tx);
      if (!encounter || encounter.status !== 'OPEN') {
        throw new BadRequestException('No open encounter to resolve');
      }
      if (!encounter.participants.some((p) => p.playerId === playerId)) {
        throw new ForbiddenException('Only participants may resolve this encounter');
      }

      const result = await this.settle(boss, encounter, tx);
      return result;
    });
  }

  private async finalizeIfExpired(bossId: string, tx: Tx = this.prisma): Promise<void> {
    const encounter = await tx.bossEncounter.findFirst({
      where: { bossId, status: 'OPEN', resolvesAt: { lte: new Date() } },
      include: { participants: { include: { player: true } } },
    });
    if (!encounter) {
      return;
    }
    const boss = await tx.boss.findUniqueOrThrow({ where: { id: bossId }, include: { lootDrops: true } });
    await this.settle(boss, encounter, tx);
  }

  /** Resolves an OPEN encounter now: simulates combat (if anyone joined) and grants rewards. */
  private async settle(
    boss: Boss & { lootDrops: BossLootDrop[] },
    encounter: EncounterWithParticipants,
    tx: Tx,
  ): Promise<BossEncounterResultDto> {
    if (encounter.participants.length === 0) {
      const resolved = await tx.bossEncounter.update({
        where: { id: encounter.id },
        data: { status: 'RESOLVED', outcome: null, rounds: [], partyMaxHp: 0, bossMaxHp: boss.maxHp },
      });
      return toResultDto(resolved, []);
    }

    const synergyBonusPercent = computeSynergyBonusPercent(encounter.participants.map((p) => p.player.race));

    const perPlayerStats = await Promise.all(
      encounter.participants.map((p) => this.combat.computePlayerStats(p.playerId, tx)),
    );

    const totalIndividualAttack = perPlayerStats.reduce((sum, s) => sum + s.attack, 0);
    const partyStats = {
      attack: totalIndividualAttack * (1 + synergyBonusPercent),
      defense: perPlayerStats.reduce((sum, s) => sum + s.defense, 0),
      hp: perPlayerStats.reduce((sum, s) => sum + s.hp, 0),
    };

    const combatResult = this.combat.simulate(partyStats, boss);

    const participantResults: { playerId: string; contributionShare: number; xpGained: number; lootSummary: LootResultEntryDto[] }[] = [];

    for (let i = 0; i < encounter.participants.length; i += 1) {
      const participant = encounter.participants[i];
      const contributionShare = totalIndividualAttack > 0 ? perPlayerStats[i].attack / totalIndividualAttack : 1 / encounter.participants.length;

      let xpGained = 0;
      const lootSummary: LootResultEntryDto[] = [];

      if (combatResult.won) {
        xpGained = Math.round(boss.xpReward * contributionShare);
        await this.economy.applyXp(participant.playerId, xpGained, tx);

        for (const drop of boss.lootDrops) {
          if (Math.random() > drop.dropChance) {
            continue;
          }
          const quantity = randomInt(drop.minQuantity, drop.maxQuantity);

          if (drop.resourceType) {
            const field = RESOURCE_FIELD[drop.resourceType as ResourceType];
            await tx.player.update({ where: { id: participant.playerId }, data: { [field]: { increment: quantity } } });
            lootSummary.push({ type: 'resource', resourceType: drop.resourceType as ResourceType, quantity });
          } else if (drop.itemDefinitionId) {
            const itemDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { id: drop.itemDefinitionId } });
            for (let q = 0; q < quantity; q += 1) {
              await tx.itemInstance.create({ data: { playerId: participant.playerId, itemDefinitionId: itemDefinition.id } });
            }
            lootSummary.push({ type: 'item', itemDefinitionKey: itemDefinition.key, itemNameKey: itemDefinition.nameKey, quantity });
          }
        }
      }

      await tx.bossEncounterParticipant.update({
        where: { id: participant.id },
        data: {
          contributionShare,
          xpGained,
          lootSummary: lootSummary as unknown as Prisma.InputJsonValue,
        },
      });

      participantResults.push({ playerId: participant.playerId, contributionShare, xpGained, lootSummary });
    }

    const resolved = await tx.bossEncounter.update({
      where: { id: encounter.id },
      data: {
        status: 'RESOLVED',
        outcome: combatResult.won ? 'WIN' : 'LOSS',
        rounds: combatResult.rounds as unknown as Prisma.InputJsonValue,
        partyMaxHp: combatResult.playerMaxHp,
        bossMaxHp: combatResult.pentiliMaxHp,
      },
    });

    return {
      outcome: resolved.outcome as 'WIN' | 'LOSS',
      rounds: combatResult.rounds,
      partyMaxHp: resolved.partyMaxHp ?? 0,
      bossMaxHp: resolved.bossMaxHp ?? boss.maxHp,
      synergyBonusPercent,
      participants: participantResults,
    };
  }

  private async openNewEncounter(boss: Boss, tx: Tx): Promise<EncounterWithParticipants> {
    return tx.bossEncounter.create({
      data: {
        bossId: boss.id,
        resolvesAt: new Date(Date.now() + boss.encounterWindowSeconds * 1000),
      },
      include: { participants: { include: { player: true } } },
    });
  }

  private loadLatestEncounter(bossId: string, tx: Tx = this.prisma): Promise<EncounterWithParticipants | null> {
    return tx.bossEncounter.findFirst({
      where: { bossId },
      orderBy: { openedAt: 'desc' },
      include: { participants: { include: { player: true } } },
    });
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toBossDto(boss: Boss, zone: Zone, player: Player, encounter: EncounterWithParticipants | null): BossDto {
  return {
    id: boss.id,
    key: boss.key,
    nameKey: boss.nameKey,
    zoneNameKey: zone.nameKey,
    level: boss.level,
    maxHp: boss.maxHp,
    attack: boss.attack,
    defense: boss.defense,
    xpReward: boss.xpReward,
    iconAssetId: boss.iconAssetId,
    unlocked: player.level >= zone.unlockLevel,
    encounter: encounter
      ? toEncounterDto(encounter, player.id)
      : {
          id: '',
          status: 'OPEN',
          openedAt: new Date().toISOString(),
          resolvesAt: new Date().toISOString(),
          participants: [],
          result: null,
        },
  };
}

function toEncounterDto(encounter: EncounterWithParticipants, currentPlayerId: string): BossEncounterDto {
  const participants: BossEncounterParticipantDto[] = encounter.participants.map((p) => ({
    playerId: p.playerId,
    race: p.player.race,
    joinedAt: p.joinedAt.toISOString(),
    isCurrentPlayer: p.playerId === currentPlayerId,
  }));

  return {
    id: encounter.id,
    status: encounter.status,
    openedAt: encounter.openedAt.toISOString(),
    resolvesAt: encounter.resolvesAt.toISOString(),
    participants,
    result: encounter.status === 'RESOLVED' ? toResultDto(encounter, encounter.participants) : null,
  };
}

function toResultDto(
  encounter: BossEncounter,
  participants: (BossEncounterParticipant & { player: Player })[],
): BossEncounterResultDto {
  return {
    outcome: encounter.outcome as 'WIN' | 'LOSS' | null,
    rounds: (encounter.rounds as unknown as BossEncounterResultDto['rounds']) ?? [],
    partyMaxHp: encounter.partyMaxHp ?? 0,
    bossMaxHp: encounter.bossMaxHp ?? 0,
    synergyBonusPercent: computeSynergyBonusPercent(participants.map((p) => p.player.race)),
    participants: participants.map((p) => ({
      playerId: p.playerId,
      contributionShare: p.contributionShare ?? 0,
      xpGained: p.xpGained ?? 0,
      lootSummary: (p.lootSummary as unknown as LootResultEntryDto[]) ?? [],
    })),
  };
}

function computeSynergyBonusPercent(races: string[]): number {
  const uniqueRaces = new Set(races).size;
  return GAME_BALANCE.bossHunts.synergyBonusByUniqueRaceCount[uniqueRaces] ?? 0;
}
