import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import {
  AdminBuildingBalanceDto,
  AdminClanBalanceDto,
  AdminBossBalanceDto,
  BossParticipantDto,
  BossRealTestResultDto,
  AdminBossRowDto,
  AdminEquipmentBalanceDto,
  AdminEquipmentZoneDto,
  AdminExpeditionBalanceDto,
  AdminOtherBalanceDto,
  AdminRewardBalanceDto,
  AdminShopDto,
  AdminPentiliBalanceDto,
  AdminPentiliRowDto,
  AdminXpBalanceDto,
  EquipmentSplitDto,
} from '@pentilius/shared';
import { applyBossBalance, BOSS_BALANCE_KEY, BossBalanceConfig, bossResourceRanges, loadBossBalance } from '../config/boss-balance';
import { Prisma } from '@prisma/client';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import {
  applyPentiliBalance,
  computePentili,
  loadPentiliBalance,
  PENTILI_BALANCE_KEY,
  PentiliBalanceConfig,
  PentiliOwnSettings,
} from '../config/pentili-balance';
import { setProductionGrowth } from '../base/building-effects';
import {
  applyBuildingBalance,
  BUILDING_BALANCE_KEY,
  BUILDING_EFFECT_FIELDS,
  BuildingBalanceConfig,
  computeBuildingLevels,
  computeResearchLevels,
  loadBuildingBalance,
} from '../config/building-balance';
import { applyClanBalance, CLAN_BALANCE_KEY, ClanBalanceConfig, computeClanLevels, loadClanBalance, setClanRuntime } from '../config/clan-balance';
import {
  applyEquipmentBalance,
  EQUIPMENT_BALANCE_KEY,
  EQUIPMENT_SLOTS,
  EquipmentBalanceConfig,
  loadEquipmentBalance,
  SET_TIERS,
  setEquipmentRuntime,
  SetTier,
  stonesToMax,
} from '../config/equipment-balance';
import {
  applyExpeditionBalance,
  EXPEDITION_BALANCE_KEY,
  ExpeditionBalanceConfig,
  expeditionRewards,
  loadExpeditionBalance,
} from '../config/expedition-balance';
import { attributePointsForLevel, GAME_BALANCE } from '../config/game-config';
import { OTHER_SET, OverrideSet, TECHNICAL_SET } from '../config/other-balance';
import { applyRewardBalance, loadRewardBalance, REWARD_BALANCE_KEY, RewardBalanceConfig } from '../config/reward-balance';
import { applyXpBalance, computeXpThresholds, loadXpBalance, XP_BALANCE_KEY, XpBalanceConfig } from '../config/xp-balance';
import { PrismaService } from '../prisma/prisma.service';
import { aggregateFormationCombatStats, CombatService, simulateCombat } from '../pve/combat.service';
import { findTavern, isTavernActive } from '../clans/clan-tavern';
import { isVip } from '../vip/vip';
import { SavePentiliBalanceDto } from './dto/save-pentili-balance.dto';
import { SaveBuildingBalanceDto } from './dto/save-building-balance.dto';
import { SaveClanBalanceDto } from './dto/save-clan-balance.dto';
import { SaveEquipmentBalanceDto } from './dto/save-equipment-balance.dto';
import { SaveExpeditionBalanceDto } from './dto/save-expedition-balance.dto';
import { BossRealTestDto } from './dto/boss-real-test.dto';
import { SaveBossBalanceDto } from './dto/save-boss-balance.dto';
import { SaveOtherBalanceDto } from './dto/save-other-balance.dto';
import { SaveRewardBalanceDto } from './dto/save-reward-balance.dto';
import { SaveShopDto } from './dto/save-shop.dto';
import { SaveXpBalanceDto } from './dto/save-xp-balance.dto';

/**
 * godmaster → Balance → Pentili (owner decision, 2026-10-18): curves for
 * strength and rewards, per-zone start/step/strength/drops, and a few
 * per-Pentili settings. Preview computes without saving; save stores the
 * config and regenerates every Pentili's stats and loot. ADMIN only, logged.
 */
@Injectable()
export class AdminBalanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly combat: CombatService,
  ) {}

  /** The Hideout/Exchange/Cantina effects follow the saved production growth from the start. */
  async onModuleInit(): Promise<void> {
    setProductionGrowth((await loadBuildingBalance(this.prisma)).production.growth);
    setClanRuntime(await loadClanBalance(this.prisma));
    setEquipmentRuntime(await loadEquipmentBalance(this.prisma));
    for (const set of [OTHER_SET, TECHNICAL_SET]) set.apply(await set.load(this.prisma));
    applyRewardBalance(await loadRewardBalance(this.prisma));
  }

  // ---- Rewards: daily tasks, achievements, level rewards (owner decision, 2026-10-19) ----

  async getRewards(admin: AdminJwtPayload): Promise<AdminRewardBalanceDto> {
    assertAdmin(admin);
    return this.buildRewards(await loadRewardBalance(this.prisma), null);
  }

  async previewRewards(dto: SaveRewardBalanceDto, admin: AdminJwtPayload): Promise<AdminRewardBalanceDto> {
    assertAdmin(admin);
    return this.buildRewards(await this.validateRewards(dto.config), await loadRewardBalance(this.prisma));
  }

  async saveRewards(dto: SaveRewardBalanceDto, admin: AdminJwtPayload): Promise<AdminRewardBalanceDto> {
    assertAdmin(admin);
    const config = await this.validateRewards(dto.config);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.balanceConfig.findUnique({ where: { key: REWARD_BALANCE_KEY } });
      await tx.balanceConfig.upsert({
        where: { key: REWARD_BALANCE_KEY },
        update: { data: config as unknown as Prisma.InputJsonValue },
        create: { key: REWARD_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
      });
      await tx.adminActionLog.create({
        data: {
          adminId: admin.sub,
          adminUsername: admin.username,
          actionType: 'UPDATE_REWARD_BALANCE',
          details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    applyRewardBalance(config);
    return this.getRewards(admin);
  }

  /** Same shape as the saved one, sane numbers, items that exist. */
  private async validateRewards(config: RewardBalanceConfig): Promise<RewardBalanceConfig> {
    const bad = () => new BadRequestException('REWARD_OUT_OF_RANGE');
    const int = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
    const num = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
    const current = await loadRewardBalance(this.prisma);
    const itemKeys = new Set((await this.prisma.itemDefinition.findMany({ select: { key: true } })).map((i) => i.key));
    const item = (key: unknown) => typeof key === 'string' && itemKeys.has(key);

    const lr = config.levelRewards;
    if (!num(lr.metalPerLevel, 0, 1_000_000) || !num(lr.crystalPerLevel, 0, 1_000_000) || !int(lr.boxEveryLevels, 1, 100)) throw bad();
    if (!Array.isArray(lr.boxes) || lr.boxes.length !== current.levelRewards.boxes.length) throw bad();
    lr.boxes.forEach((b, i) => {
      if (!int(b.upToLevel, 1, 100) || !item(b.itemKey) || (i > 0 && b.upToLevel <= lr.boxes[i - 1].upToLevel)) throw bad();
    });

    const dt = config.dailyTasks;
    for (const key of Object.keys(current.dailyTasks.tasks)) {
      const t = dt.tasks?.[key];
      if (!t || !int(t.target, 1, 1_000_000)) throw bad();
      const r = t.reward;
      if (!num(r.metalPerLevel, 0, 1_000_000) || !num(r.crystalPerLevel, 0, 1_000_000) || !num(r.xpPerLevel, 0, 1_000_000) || !int(r.energy, 0, 100)) throw bad();
    }
    if (!item(dt.allDoneBonusItemKey) || !item(dt.streak.rewardItemKey) || !int(dt.streak.days, 1, 60) || !int(dt.streak.allowedMisses, 0, 30)) throw bad();
    if (!int(dt.allDoneBonusCredits, 0, 10_000) || !int(dt.streak.rewardCredits, 0, 10_000)) throw bad();

    for (const [key, tiers] of Object.entries(current.achievements)) {
      const t = config.achievements?.[key];
      if (!Array.isArray(t) || t.length !== tiers.length) throw bad();
      for (const tier of t) {
        if (!int(tier.target, 1, 100_000_000) || !num(tier.reward.metal, 0, 100_000_000) || !num(tier.reward.crystal, 0, 100_000_000)) throw bad();
        if (tier.reward.itemKey !== null && !item(tier.reward.itemKey)) throw bad();
        if (!int(tier.reward.credits, 0, 10_000)) throw bad();
      }
    }
    return {
      levelRewards: lr,
      dailyTasks: {
        tasks: Object.fromEntries(Object.keys(current.dailyTasks.tasks).map((k) => [k, dt.tasks[k]])),
        allDoneBonusItemKey: dt.allDoneBonusItemKey,
        allDoneBonusCredits: dt.allDoneBonusCredits,
        streak: dt.streak,
      },
      achievements: Object.fromEntries(Object.keys(current.achievements).map((k) => [k, config.achievements[k]])),
    };
  }

  /** What the rewards are worth at a few player levels, in Pentili fights of that level. */
  private async buildRewards(config: RewardBalanceConfig, saved: RewardBalanceConfig | null): Promise<AdminRewardBalanceDto> {
    const [pentili, items] = await Promise.all([
      loadPentiliBalance(this.prisma),
      this.prisma.itemDefinition.findMany({ select: { key: true, nameKey: true }, orderBy: { key: 'asc' } }),
    ]);
    const fight = (curve: { base: number; growth: number }, level: number) => curve.base * Math.pow(level, curve.growth);
    const levels = (c: RewardBalanceConfig) =>
      [1, 10, 30, 60, 100].map((level) => {
        const tasks = Object.values(c.dailyTasks.tasks);
        const all = {
          metal: tasks.reduce((s, t) => s + t.reward.metalPerLevel * level, 0),
          xp: tasks.reduce((s, t) => s + t.reward.xpPerLevel * level, 0),
        };
        const levelMetal = c.levelRewards.metalPerLevel * level;
        return {
          level,
          // All daily tasks of a day together, and one level-up reward.
          dailyMetal: all.metal,
          dailyXp: all.xp,
          dailyMetalFights: Math.round((all.metal / fight(pentili.rewards.metal, level)) * 10) / 10,
          dailyXpFights: Math.round((all.xp / fight(pentili.stats.xp, level)) * 10) / 10,
          levelMetal,
          levelMetalFights: Math.round((levelMetal / fight(pentili.rewards.metal, level)) * 10) / 10,
        };
      });
    const metrics = Object.fromEntries(GAME_BALANCE.achievements.map((a) => [a.key, a.metric]));
    const taskInfo = Object.fromEntries(GAME_BALANCE.dailyTasks.tasks.map((t) => [t.key, { type: t.type, chain: t.chain ?? null }]));
    return {
      config,
      levels: levels(config),
      currentLevels: saved ? levels(saved) : null,
      taskInfo,
      achievementMetrics: metrics,
      items: items.map((i) => ({ key: i.key, nameKey: i.nameKey })),
    };
  }

  // ---- Other values (owner decision, 2026-10-19) ----

  getOther(admin: AdminJwtPayload): AdminOtherBalanceDto {
    assertAdmin(admin);
    return overrideDto(OTHER_SET);
  }

  saveOther(dto: SaveOtherBalanceDto, admin: AdminJwtPayload): Promise<AdminOtherBalanceDto> {
    assertAdmin(admin);
    return this.saveOverrides(OTHER_SET, dto, admin, 'UPDATE_OTHER_BALANCE');
  }

  // Technical limits — godmaster → Settings (owner decision, 2026-10-19).
  getTechnical(admin: AdminJwtPayload): AdminOtherBalanceDto {
    assertAdmin(admin);
    return overrideDto(TECHNICAL_SET);
  }

  saveTechnical(dto: SaveOtherBalanceDto, admin: AdminJwtPayload): Promise<AdminOtherBalanceDto> {
    assertAdmin(admin);
    return this.saveOverrides(TECHNICAL_SET, dto, admin, 'UPDATE_TECHNICAL_SETTINGS');
  }

  /** Saves only values that differ from game-config.ts, so a later code default still applies to the rest. */
  private async saveOverrides(
    set: OverrideSet,
    dto: SaveOtherBalanceDto,
    admin: AdminJwtPayload,
    actionType: 'UPDATE_OTHER_BALANCE' | 'UPDATE_TECHNICAL_SETTINGS',
  ): Promise<AdminOtherBalanceDto> {
    const overrides: Record<string, number> = {};
    for (const d of set.defs) {
      const v = dto.values?.[d.path];
      if (v === undefined) continue;
      if (
        typeof v !== 'number' ||
        !Number.isFinite(v) ||
        v < d.min ||
        v > d.max ||
        (d.kind === 'int' && !Number.isInteger(v)) ||
        (d.oneOf && !d.oneOf.includes(v))
      ) {
        throw new BadRequestException(`VALUE_OUT_OF_RANGE:${d.path}`);
      }
      if (v !== set.defaults[d.path]) overrides[d.path] = v;
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.balanceConfig.findUnique({ where: { key: set.key } });
      await tx.balanceConfig.upsert({ where: { key: set.key }, update: { data: overrides }, create: { key: set.key, data: overrides } });
      await tx.adminActionLog.create({
        data: {
          adminId: admin.sub,
          adminUsername: admin.username,
          actionType,
          details: { before: before?.data ?? null, after: overrides } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    set.apply(overrides);
    return overrideDto(set);
  }

  // ---- Bosses (owner decision, 2026-10-19) ----

  async getBosses(admin: AdminJwtPayload): Promise<AdminBossBalanceDto> {
    assertAdmin(admin);
    return this.buildBosses(await loadBossBalance(this.prisma), null, {}, DEFAULT_BOSS_PLAYERS, DEFAULT_BOSS_TARGET);
  }

  async previewBosses(dto: SaveBossBalanceDto, admin: AdminJwtPayload): Promise<AdminBossBalanceDto> {
    assertAdmin(admin);
    const config = validateBosses(dto.config);
    const preview = validateBossPreview(dto, config);
    return this.buildBosses(config, await loadBossBalance(this.prisma), preview.participants, preview.players, preview.target);
  }

  async saveBosses(dto: SaveBossBalanceDto, admin: AdminJwtPayload): Promise<AdminBossBalanceDto> {
    assertAdmin(admin);
    const config = validateBosses(dto.config);
    const preview = validateBossPreview(dto, config);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.balanceConfig.findUnique({ where: { key: BOSS_BALANCE_KEY } });
      await tx.balanceConfig.upsert({
        where: { key: BOSS_BALANCE_KEY },
        update: { data: config as unknown as Prisma.InputJsonValue },
        create: { key: BOSS_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
      });
      await applyBossBalance(tx, config, await loadPentiliBalance(tx));
      await tx.adminActionLog.create({
        data: {
          adminId: admin.sub,
          adminUsername: admin.username,
          actionType: 'UPDATE_BOSS_BALANCE',
          details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return this.buildBosses(config, null, preview.participants, preview.players, preview.target);
  }

  /**
   * Real players against a boss (owner decision, 2026-10-27): each robot is
   * read exactly as a boss fight reads it (gear, upgrades, Excellent options,
   * points, research, the clan's Forge, the Cantina only if active), combined
   * like a formation, and fought against
   * the boss as it is in the form. Read-only: nothing is saved or granted.
   */
  async testBossWithPlayers(dto: BossRealTestDto, admin: AdminJwtPayload): Promise<BossRealTestResultDto> {
    assertAdmin(admin);
    const config = validateBosses(dto.config);
    const boss = config.bosses[dto.bossKey];
    if (!boss) throw new BadRequestException('BOSS_NOT_FOUND');
    const names = [...new Set(dto.usernames.map((n) => n.trim()).filter(Boolean))];
    const found = await this.prisma.player.findMany({
      where: { deletedAt: null, OR: names.map((username) => ({ username: { equals: username, mode: 'insensitive' as const } })) },
      select: {
        id: true,
        username: true,
        level: true,
        race: true,
        selectedAvatarKey: true,
        selectedFrameKey: true,
        vipUntil: true,
        clanMembership: { select: { clanId: true } },
      },
    });
    const bossRow = await this.prisma.boss.findUnique({ where: { key: dto.bossKey }, select: { nameKey: true, iconAssetId: true } });
    const players = [];
    const breakdowns = [];
    for (const player of found) {
      const breakdown = await this.combat.computeCombatBreakdown(player.id, this.prisma, { bossOrCore: true });
      const tavern = player.clanMembership ? await findTavern(player.clanMembership.clanId, this.prisma) : null;
      const tavernActive = isTavernActive(tavern);
      const alone = aggregateFormationCombatStats([breakdown]);
      players.push({
        username: player.username,
        level: player.level,
        race: player.race,
        attack: Math.round(alone.attack),
        defense: Math.round(alone.defense),
        hp: Math.round(alone.hp),
        tavernActive,
        avatarKey: player.selectedAvatarKey ?? null,
        frameKey: player.selectedFrameKey ?? null,
        vip: isVip(player),
      });
      breakdowns.push(breakdown);
    }

    const party = breakdowns.length > 0 ? aggregateFormationCombatStats(breakdowns) : null;
    let wins = 0;
    if (party) for (let i = 0; i < SIMULATION_RUNS; i++) if (simulateCombat(party, { attack: boss.attack, defense: boss.defense, maxHp: boss.maxHp }).won) wins++;
    const lower = new Set(found.map((p) => p.username.toLowerCase()));
    const sample = party ? simulateCombat(party, { attack: boss.attack, defense: boss.defense, maxHp: boss.maxHp }) : null;
    return {
      bossKey: dto.bossKey,
      bossNameKey: bossRow?.nameKey ?? '',
      bossIconAssetId: bossRow?.iconAssetId ?? '',
      sample: sample ? { won: sample.won, rounds: sample.rounds, partyMaxHp: sample.playerMaxHp, bossMaxHp: sample.pentiliMaxHp } : null,
      players,
      missing: names.filter((n) => !lower.has(n.toLowerCase())),
      duplicateRaces: new Set(found.map((p) => p.race)).size < found.length,
      party: party ? { attack: Math.round(party.attack), defense: Math.round(party.defense), hp: Math.round(party.hp) } : { attack: 0, defense: 0, hp: 0 },
      win: party ? Math.round((wins / SIMULATION_RUNS) * 1000) / 10 : 0,
    };
  }

  /**
   * Each boss with its rewards and its example participant (owner decision,
   * 2026-10-27): one robot set up per boss and fought 1 to 5 times over; the
   * boss strength at which `players` of them win about `target`; and the
   * zone's strongest Pentil to compare the rewards with.
   */
  private async buildBosses(
    config: BossBalanceConfig,
    saved: BossBalanceConfig | null,
    participants: Record<string, BossParticipantDto>,
    players: number,
    target: number,
  ): Promise<AdminBossBalanceDto> {
    const [pentili, equipment, bosses, items, maxBonuses, tavernType, strongest] = await Promise.all([
      loadPentiliBalance(this.prisma),
      loadEquipmentBalance(this.prisma),
      this.prisma.boss.findMany({ include: { zone: { select: { key: true, nameKey: true } } }, orderBy: { level: 'asc' } }),
      this.prisma.itemDefinition.findMany({ select: { key: true, nameKey: true, category: true }, orderBy: { key: 'asc' } }),
      this.maxCombatBonuses(),
      this.prisma.clanBuildingType.findFirst({ where: { bonusType: 'BOSS_CORE_DAMAGE' } }),
      this.prisma.pentili.findMany({ select: { zoneId: true, level: true, xpReward: true }, orderBy: { level: 'desc' } }),
    ]);
    const rows = (c: BossBalanceConfig, withSuggestion: boolean): AdminBossRowDto[] =>
      bosses
        .filter((boss) => c.bosses[boss.key])
        .map((boss) => {
          const b = c.bosses[boss.key];
          const tier = (pentili.zones[boss.zone.key]?.itemTier ?? 'pioneer') as SetTier;
          const participant = participants[boss.key] ?? defaultBossParticipant(b.minLevel);
          const one = participantRobot(equipment, tier, participant);
          const party = (k: number) => ({ attack: one.attack * k, defense: one.defense * k, hp: one.hp * k });
          const top = strongest.find((x) => x.zoneId === boss.zoneId);
          return {
            key: boss.key,
            nameKey: boss.nameKey,
            zoneNameKey: boss.zone.nameKey,
            tier,
            ...bossResourceRanges(b, pentili),
            participant,
            formations: [1, 2, 3, 4, 5].map((k) => ({
              players: k,
              xpEach: Math.floor(b.xpReward / k),
              win: winRate(party(k), { attack: b.attack, defense: b.defense, maxHp: b.maxHp }),
            })),
            suggestion: withSuggestion ? suggestBossStrength(party(players), b, target) : null,
            lastPentil: top ? { level: top.level, xp: top.xpReward, metal: Math.round(pentili.rewards.metal.base * Math.pow(top.level, pentili.rewards.metal.growth)) } : null,
          };
        });
    return {
      config,
      bosses: rows(config, true),
      currentBosses: saved ? rows(saved, false) : null,
      items: items.map((i) => ({ key: i.key, nameKey: i.nameKey, category: i.category })),
      players,
      target,
      maxBonuses: { ...maxBonuses, tavern: tavernType ? Math.round(tavernType.bonusPerLevel * tavernType.maxLevel * 10000) / 10000 : 0 },
      simulationRuns: SIMULATION_RUNS,
    };
  }

  // ---- Expeditions (owner decision, 2026-10-19) ----

  async getExpeditions(admin: AdminJwtPayload): Promise<AdminExpeditionBalanceDto> {
    assertAdmin(admin);
    return this.buildExpeditions(await loadExpeditionBalance(this.prisma), null);
  }

  async previewExpeditions(dto: SaveExpeditionBalanceDto, admin: AdminJwtPayload): Promise<AdminExpeditionBalanceDto> {
    assertAdmin(admin);
    return this.buildExpeditions(validateExpeditions(dto.config), await loadExpeditionBalance(this.prisma));
  }

  async saveExpeditions(dto: SaveExpeditionBalanceDto, admin: AdminJwtPayload): Promise<AdminExpeditionBalanceDto> {
    assertAdmin(admin);
    const config = validateExpeditions(dto.config);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.balanceConfig.findUnique({ where: { key: EXPEDITION_BALANCE_KEY } });
      await tx.balanceConfig.upsert({
        where: { key: EXPEDITION_BALANCE_KEY },
        update: { data: config as unknown as Prisma.InputJsonValue },
        create: { key: EXPEDITION_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
      });
      await applyExpeditionBalance(tx, config, await loadPentiliBalance(tx));
      await tx.adminActionLog.create({
        data: {
          adminId: admin.sub,
          adminUsername: admin.username,
          actionType: 'UPDATE_EXPEDITION_BALANCE',
          details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return this.getExpeditions(admin);
  }

  /** Rewards by player level for each expedition (and, in a preview, with the saved values). */
  private async buildExpeditions(config: ExpeditionBalanceConfig, saved: ExpeditionBalanceConfig | null): Promise<AdminExpeditionBalanceDto> {
    const [pentili, types] = await Promise.all([
      loadPentiliBalance(this.prisma),
      this.prisma.expeditionType.findMany({ select: { key: true, nameKey: true } }),
    ]);
    const keys = Object.keys(config.expeditions);
    const levels = (c: ExpeditionBalanceConfig) =>
      [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((level) => ({
        level,
        rewards: Object.fromEntries(keys.map((key) => [key, expeditionRewards(c.expeditions[key], pentili, level)])),
      }));
    return {
      config,
      expeditions: keys.map((key) => ({ key, nameKey: types.find((t) => t.key === key)?.nameKey ?? key })),
      fightsPerHourFromEnergy: 60 / GAME_BALANCE.actionEnergy.regenIntervalMinutes,
      levels: levels(config),
      currentLevels: saved ? levels(saved) : null,
    };
  }

  // ---- Equipment sets (owner decision, 2026-10-19) ----

  async getEquipment(admin: AdminJwtPayload): Promise<AdminEquipmentBalanceDto> {
    assertAdmin(admin);
    const config = await loadEquipmentBalance(this.prisma);
    return {
      config,
      split: DEFAULT_SPLIT,
      zones: await this.simulateZones(config, DEFAULT_SPLIT),
      currentZones: null,
      simulationRuns: SIMULATION_RUNS,
      maxBonuses: await this.maxCombatBonuses(),
    };
  }

  async previewEquipment(dto: SaveEquipmentBalanceDto, admin: AdminJwtPayload): Promise<AdminEquipmentBalanceDto> {
    assertAdmin(admin);
    const config = validateEquipment(dto.config);
    const split = validateSplit(dto.split);
    const saved = await loadEquipmentBalance(this.prisma);
    return {
      config,
      split,
      zones: await this.simulateZones(config, split),
      currentZones: await this.simulateZones(saved, split),
      simulationRuns: SIMULATION_RUNS,
      maxBonuses: await this.maxCombatBonuses(),
    };
  }

  async saveEquipment(dto: SaveEquipmentBalanceDto, admin: AdminJwtPayload): Promise<AdminEquipmentBalanceDto> {
    assertAdmin(admin);
    const config = validateEquipment(dto.config);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.balanceConfig.findUnique({ where: { key: EQUIPMENT_BALANCE_KEY } });
      await tx.balanceConfig.upsert({
        where: { key: EQUIPMENT_BALANCE_KEY },
        update: { data: config as unknown as Prisma.InputJsonValue },
        create: { key: EQUIPMENT_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
      });
      await applyEquipmentBalance(tx, config);
      await tx.adminActionLog.create({
        data: {
          adminId: admin.sub,
          adminUsername: admin.username,
          actionType: 'UPDATE_EQUIPMENT_BALANCE',
          details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    setEquipmentRuntime(config);
    const split = validateSplit(dto.split);
    return {
      config,
      split,
      zones: await this.simulateZones(config, split),
      currentZones: null,
      simulationRuns: SIMULATION_RUNS,
      maxBonuses: await this.maxCombatBonuses(),
    };
  }

  /** What the attack/HP researches and the clan Forge give at their max level today. */
  private async maxCombatBonuses(): Promise<{ researchAttack: number; researchHp: number; forge: number }> {
    const [research, forge] = await Promise.all([
      this.prisma.researchType.findMany({ where: { bonusType: { in: ['COMBAT_ATTACK', 'COMBAT_HP'] } } }),
      this.prisma.clanBuildingType.findFirst({ where: { bonusType: 'COMBAT_BONUS' } }),
    ]);
    const sum = (type: string) => research.filter((r) => r.bonusType === type).reduce((s, r) => s + r.bonusPerLevel * r.maxLevel, 0);
    const round = (x: number) => Math.round(x * 10000) / 10000;
    return { researchAttack: round(sum('COMBAT_ATTACK')), researchHp: round(sum('COMBAT_HP')), forge: round(forge ? forge.bonusPerLevel * forge.maxLevel : 0) };
  }

  /**
   * For each zone: a reference robot at the level of the zone's first and
   * last Pentili — innate floor + attribute points (spent by `split`) + the
   * full set the zone drops — without gear, at +0 and at max upgrade, fought
   * SIMULATION_RUNS times with the real combat code. Research and Forge
   * bonuses as given in `split` (combined like computeCombatBreakdown); no
   * Excellent options.
   */
  private async simulateZones(config: EquipmentBalanceConfig, split: EquipmentSplitDto): Promise<AdminEquipmentZoneDto[]> {
    const [pentiliBalance, zones, pentili] = await Promise.all([
      loadPentiliBalance(this.prisma),
      this.prisma.zone.findMany({ orderBy: { order: 'asc' }, select: { key: true, nameKey: true } }),
      this.prisma.pentili.findMany({ include: { zone: { select: { key: true } } }, orderBy: { orderInZone: 'asc' } }),
    ]);
    const robot = (level: number, tier: SetTier | null, upgrade: number) => referenceRobot(config, split, level, tier, upgrade);
    const fragmentsPerItem = GAME_BALANCE.itemRecycle.fragmentsPerItem;
    return zones
      .filter((z) => pentiliBalance.zones[z.key])
      .map((z) => {
        const zb = pentiliBalance.zones[z.key];
        const tier = zb.itemTier as SetTier;
        const maxLevel = config.sets[tier].maxUpgradeLevel;
        const inZone = pentili.filter((p) => p.zone.key === z.key);
        const picks = inZone.length > 1 ? [inZone[0], inZone[inZone.length - 1]] : inZone;
        // Stones per fight: dropped stones, plus dropped fragments and the
        // fragments from recycling the dropped set items (7 slots).
        const stonesPerBattle = zb.upgradeStoneChance + (zb.fragmentChance + EQUIPMENT_SLOTS.length * zb.itemChance * fragmentsPerItem) / config.upgrade.fragmentsPerStone;
        const stones = stonesToMax(config, maxLevel);
        return {
          zoneKey: z.key,
          zoneNameKey: z.nameKey,
          tier,
          maxUpgradeLevel: maxLevel,
          stonesToMax: stones,
          stonesPerBattle: Math.round(stonesPerBattle * 10000) / 10000,
          battlesToMax: stonesPerBattle > 0 ? Math.ceil(stones / stonesPerBattle) : null,
          fights: picks.map((p) => {
            const opponent = { attack: p.attack, defense: p.defense, maxHp: p.maxHp };
            const states = [
              { kind: 'none' as const, stats: robot(p.level, null, 0) },
              { kind: 'base' as const, stats: robot(p.level, tier, 0) },
              { kind: 'max' as const, stats: robot(p.level, tier, maxLevel) },
            ];
            return {
              pentiliKey: p.key,
              nameKey: p.nameKey,
              level: p.level,
              pentili: opponent,
              attributePoints: states[0].stats.points,
              robots: states.map((st) => ({
                kind: st.kind,
                stats: { attack: Math.round(st.stats.attack), defense: Math.round(st.stats.defense), hp: Math.round(st.stats.hp) },
                winRate: winRate(st.stats, opponent),
              })),
            };
          }),
        };
      });
  }

  // ---- Clan buildings (owner decision, 2026-10-19) ----

  async getClan(admin: AdminJwtPayload): Promise<AdminClanBalanceDto> {
    assertAdmin(admin);
    return this.buildClan(await loadClanBalance(this.prisma));
  }

  async previewClan(dto: SaveClanBalanceDto, admin: AdminJwtPayload): Promise<AdminClanBalanceDto> {
    assertAdmin(admin);
    return this.buildClan(validateClan(dto.config));
  }

  async saveClan(dto: SaveClanBalanceDto, admin: AdminJwtPayload): Promise<AdminClanBalanceDto> {
    assertAdmin(admin);
    const config = validateClan(dto.config);
    await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.balanceConfig.findUnique({ where: { key: CLAN_BALANCE_KEY } });
        await tx.balanceConfig.upsert({
          where: { key: CLAN_BALANCE_KEY },
          update: { data: config as unknown as Prisma.InputJsonValue },
          create: { key: CLAN_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
        });
        await applyClanBalance(tx, config);
        await tx.adminActionLog.create({
          data: {
            adminId: admin.sub,
            adminUsername: admin.username,
            actionType: 'UPDATE_CLAN_BALANCE',
            details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 120_000 },
    );
    setClanRuntime(config);
    return this.getClan(admin);
  }

  private async buildClan(config: ClanBalanceConfig): Promise<AdminClanBalanceDto> {
    const [buildings, types] = await Promise.all([
      loadBuildingBalance(this.prisma),
      this.prisma.clanBuildingType.findMany({ include: { levelCosts: { orderBy: { level: 'asc' } } } }),
    ]);
    const order = Object.keys(config.buildings);
    return {
      config,
      buildings: types
        .filter((t) => order.includes(t.key))
        .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
        .map((t) => {
          const current = new Map(t.levelCosts.map((c) => [c.level, c]));
          return {
            key: t.key,
            nameKey: t.nameKey,
            bonusType: t.bonusType,
            levels: computeClanLevels(config, buildings, t.key).map((row) => {
              const c = current.get(row.level);
              return {
                ...row,
                current: c ? { metalCost: c.metalCost, crystalCost: c.crystalCost, creditsCost: c.creditsCost, constructionSeconds: c.constructionSeconds } : null,
              };
            }),
          };
        }),
    };
  }

  // ---- Buildings and research (owner decision, 2026-10-19) ----

  async getBuildings(admin: AdminJwtPayload): Promise<AdminBuildingBalanceDto> {
    assertAdmin(admin);
    return this.buildBuildings(await loadBuildingBalance(this.prisma));
  }

  async previewBuildings(dto: SaveBuildingBalanceDto, admin: AdminJwtPayload): Promise<AdminBuildingBalanceDto> {
    assertAdmin(admin);
    return this.buildBuildings(validateBuildings(dto.config));
  }

  async saveBuildings(dto: SaveBuildingBalanceDto, admin: AdminJwtPayload): Promise<AdminBuildingBalanceDto> {
    assertAdmin(admin);
    const config = validateBuildings(dto.config);
    await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.balanceConfig.findUnique({ where: { key: BUILDING_BALANCE_KEY } });
        await tx.balanceConfig.upsert({
          where: { key: BUILDING_BALANCE_KEY },
          update: { data: config as unknown as Prisma.InputJsonValue },
          create: { key: BUILDING_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
        });
        await applyBuildingBalance(tx, config);
        // Clan building costs follow the same production model.
        await applyClanBalance(tx, await loadClanBalance(tx));
        await tx.adminActionLog.create({
          data: {
            adminId: admin.sub,
            adminUsername: admin.username,
            actionType: 'UPDATE_BUILDING_BALANCE',
            details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 120_000 },
    );
    setProductionGrowth(config.production.growth);
    return this.getBuildings(admin);
  }

  /** Every building's and research's levels as they are now and as they'd become. */
  private async buildBuildings(config: BuildingBalanceConfig): Promise<AdminBuildingBalanceDto> {
    const [types, researchTypes] = await Promise.all([
      this.prisma.buildingType.findMany({ include: { levelCosts: { orderBy: { level: 'asc' } } } }),
      this.prisma.researchType.findMany({ include: { levelCosts: { orderBy: { level: 'asc' } } } }),
    ]);
    const buildingOrder = Object.keys(config.buildings);
    const researchOrder = Object.keys(config.research.items);
    return {
      config,
      buildings: types
        .filter((t) => config.buildings[t.key])
        .sort((a, b) => buildingOrder.indexOf(a.key) - buildingOrder.indexOf(b.key))
        .map((t) => {
          const current = new Map(t.levelCosts.map((c) => [c.level, c]));
          return {
            key: t.key,
            nameKey: t.nameKey,
            levels: computeBuildingLevels(config, t.key).map((row) => {
              const c = current.get(row.level);
              return {
                ...row,
                current: c ? { metalCost: c.metalCost, crystalCost: c.crystalCost, constructionSeconds: c.constructionSeconds, producesPerHour: c.producesPerHour } : null,
              };
            }),
          };
        }),
      research: researchTypes
        .filter((t) => config.research.items[t.key])
        .sort((a, b) => researchOrder.indexOf(a.key) - researchOrder.indexOf(b.key))
        .map((t) => {
          const current = new Map(t.levelCosts.map((c) => [c.level, c]));
          return {
            key: t.key,
            nameKey: t.nameKey,
            bonusType: t.bonusType,
            levels: computeResearchLevels(config, t.key).map((row) => {
              const c = current.get(row.level);
              return {
                ...row,
                current: c ? { metalCost: c.metalCost, crystalCost: c.crystalCost, creditsCost: c.creditsCost, researchSeconds: c.researchSeconds } : null,
              };
            }),
          };
        }),
    };
  }

  async getPentili(admin: AdminJwtPayload): Promise<AdminPentiliBalanceDto> {
    assertAdmin(admin);
    const config = await loadPentiliBalance(this.prisma);
    return this.build(config, null);
  }

  /** The table as it would become, without saving anything. */
  async previewPentili(dto: SavePentiliBalanceDto, admin: AdminJwtPayload): Promise<AdminPentiliBalanceDto> {
    assertAdmin(admin);
    return this.build(validate(dto.config), dto.pentili);
  }

  async savePentili(dto: SavePentiliBalanceDto, admin: AdminJwtPayload): Promise<AdminPentiliBalanceDto> {
    assertAdmin(admin);
    const config = validate(dto.config);
    await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.balanceConfig.findUnique({ where: { key: PENTILI_BALANCE_KEY } });
        await tx.balanceConfig.upsert({
          where: { key: PENTILI_BALANCE_KEY },
          update: { data: config as unknown as Prisma.InputJsonValue },
          create: { key: PENTILI_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
        });
        for (const row of dto.pentili) {
          await tx.pentili.update({
            where: { key: row.key },
            data: {
              levelOverride: row.levelOverride ?? null,
              strength: row.strength,
              specialItemKey: row.specialItemKey || null,
              specialItemChance: row.specialItemKey ? (row.specialItemChance ?? null) : null,
            },
          });
        }
        await applyPentiliBalance(tx, config);
        // Boss Metal/Crystal follow the Pentili reward curves.
        await applyBossBalance(tx, await loadBossBalance(tx), config);
        await tx.adminActionLog.create({
          data: {
            adminId: admin.sub,
            adminUsername: admin.username,
            actionType: 'UPDATE_PENTILI_BALANCE',
            details: { before: before?.data ?? null, after: config, pentili: dto.pentili } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 60_000 },
    );
    return this.getPentili(admin);
  }

  // ---- The Shop (owner decision, 2026-10-20) ----

  /** Every item, whether the Shop sells it and its price, plus what selling it returns. */
  async getShop(admin: AdminJwtPayload): Promise<AdminShopDto> {
    assertAdmin(admin);
    const [items, equipment, recycling] = await Promise.all([
      this.prisma.itemDefinition.findMany({ orderBy: [{ category: 'asc' }, { tier: 'asc' }, { key: 'asc' }] }),
      loadEquipmentBalance(this.prisma),
      this.prisma.researchType.findFirst({ where: { bonusType: 'RECYCLING' } }),
    ]);
    const maxResearch = 1 + (recycling ? recycling.bonusPerLevel * recycling.maxLevel : 0);
    const best = Math.max(...Object.values(equipment.qualitySellMultiplier));
    return {
      items: items.map((item) => {
        const set = item.category === 'EQUIPMENT' && item.tier ? equipment.sets[item.tier.toLowerCase() as SetTier] : null;
        return {
          key: item.key,
          nameKey: item.nameKey,
          iconAssetId: item.iconAssetId,
          category: item.category,
          tier: item.tier,
          slot: item.slot,
          inShop: item.inShop,
          priceMetal: item.shopPriceMetal,
          priceCrystal: item.shopPriceCrystal,
          priceCredits: item.shopPriceCredits,
          sell: set
            ? {
                metal: Math.round(set.sellMetal * equipment.qualitySellMultiplier.NORMAL),
                crystal: Math.round(set.sellCrystal * equipment.qualitySellMultiplier.NORMAL),
                maxMetal: Math.round(set.sellMetal * best * maxResearch),
                maxCrystal: Math.round(set.sellCrystal * best * maxResearch),
              }
            : null,
        };
      }),
    };
  }

  /** Saves what the Shop sells and the prices; logs only the items that changed. */
  async saveShop(dto: SaveShopDto, admin: AdminJwtPayload): Promise<AdminShopDto> {
    assertAdmin(admin);
    const price = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 10_000_000;
    if (!Array.isArray(dto.items) || dto.items.length > 1000) throw new BadRequestException('SHOP_OUT_OF_RANGE');
    for (const i of dto.items) {
      if (typeof i?.key !== 'string' || typeof i.inShop !== 'boolean' || !price(i.priceMetal) || !price(i.priceCrystal) || !price(i.priceCredits)) {
        throw new BadRequestException('SHOP_OUT_OF_RANGE');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = new Map((await tx.itemDefinition.findMany()).map((d) => [d.key, d]));
      const changes: { key: string; before: unknown; after: unknown }[] = [];
      for (const i of dto.items) {
        const d = existing.get(i.key);
        if (!d) throw new BadRequestException('UNKNOWN_ITEM');
        const before = { inShop: d.inShop, priceMetal: d.shopPriceMetal, priceCrystal: d.shopPriceCrystal, priceCredits: d.shopPriceCredits };
        const after = { inShop: i.inShop, priceMetal: i.priceMetal, priceCrystal: i.priceCrystal, priceCredits: i.priceCredits };
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        await tx.itemDefinition.update({
          where: { key: i.key },
          data: { inShop: i.inShop, shopPriceMetal: i.priceMetal, shopPriceCrystal: i.priceCrystal, shopPriceCredits: i.priceCredits },
        });
        changes.push({ key: i.key, before, after });
      }
      if (changes.length > 0) {
        await tx.adminActionLog.create({
          data: { adminId: admin.sub, adminUsername: admin.username, actionType: 'UPDATE_SHOP', details: { changes } as unknown as Prisma.InputJsonValue },
        });
      }
    });
    return this.getShop(admin);
  }

  // ---- XP per level (owner decision, 2026-10-19) ----

  async getXp(admin: AdminJwtPayload): Promise<AdminXpBalanceDto> {
    assertAdmin(admin);
    return this.buildXp(await loadXpBalance(this.prisma));
  }

  async previewXp(dto: SaveXpBalanceDto, admin: AdminJwtPayload): Promise<AdminXpBalanceDto> {
    assertAdmin(admin);
    return this.buildXp(validateXp(dto.config));
  }

  async saveXp(dto: SaveXpBalanceDto, admin: AdminJwtPayload): Promise<AdminXpBalanceDto> {
    assertAdmin(admin);
    const config = validateXp(dto.config);
    await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.balanceConfig.findUnique({ where: { key: XP_BALANCE_KEY } });
        await tx.balanceConfig.upsert({
          where: { key: XP_BALANCE_KEY },
          update: { data: config as unknown as Prisma.InputJsonValue },
          create: { key: XP_BALANCE_KEY, data: config as unknown as Prisma.InputJsonValue },
        });
        await applyXpBalance(tx, config);
        await tx.adminActionLog.create({
          data: {
            adminId: admin.sub,
            adminUsername: admin.username,
            actionType: 'UPDATE_XP_BALANCE',
            details: { before: before?.data ?? null, after: config } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 60_000 },
    );
    return this.getXp(admin);
  }

  /**
   * Each level with the XP it needs now and under the config, plus how many
   * Pentili fights that is — against the best-paying Pentili a player of that
   * level can fight — and how long the energy for them takes to refill. Only
   * Pentili are counted; daily missions, expeditions and bosses come on top.
   */
  private async buildXp(config: XpBalanceConfig): Promise<AdminXpBalanceDto> {
    const [current, pentili] = await Promise.all([
      this.prisma.levelThreshold.findMany({ orderBy: { level: 'asc' } }),
      this.prisma.pentili.findMany({ select: { level: true, xpReward: true }, orderBy: { level: 'asc' } }),
    ]);
    const currentByLevel = new Map(current.map((r) => [r.level, r.xpRequired]));
    const energyMinutes = GAME_BALANCE.actionEnergy.regenIntervalMinutes;
    let totalBattles = 0;
    const levels = computeXpThresholds(config).map((row) => {
      const bestXp = pentili.filter((p) => p.level <= row.level).reduce((best, p) => Math.max(best, p.xpReward), 0);
      const battles = bestXp > 0 ? Math.ceil(row.xpRequired / bestXp) : null;
      if (battles) totalBattles += battles;
      return {
        level: row.level,
        current: currentByLevel.get(row.level) ?? null,
        next: row.xpRequired,
        battles,
        totalBattles,
        energyHours: battles ? Math.round(((battles * energyMinutes) / 60) * 10) / 10 : null,
      };
    });
    return { config, levels, energyMinutes };
  }

  private async build(config: PentiliBalanceConfig, overrides: SavePentiliBalanceDto['pentili'] | null): Promise<AdminPentiliBalanceDto> {
    const [zones, pentili, items] = await Promise.all([
      this.prisma.zone.findMany({ orderBy: { order: 'asc' }, select: { key: true, nameKey: true, order: true, unlockLevel: true } }),
      this.prisma.pentili.findMany({ include: { zone: { select: { key: true, order: true } } }, orderBy: [{ zone: { order: 'asc' } }, { orderInZone: 'asc' }] }),
      this.prisma.itemDefinition.findMany({ select: { key: true, nameKey: true }, orderBy: { key: 'asc' } }),
    ]);
    const byKey = new Map((overrides ?? []).map((o) => [o.key, o]));
    const rows: AdminPentiliRowDto[] = pentili.map((p) => {
      const o = byKey.get(p.key);
      const own: PentiliOwnSettings = {
        zoneKey: p.zone.key,
        orderInZone: p.orderInZone,
        levelOverride: o ? (o.levelOverride ?? null) : p.levelOverride,
        strength: o ? o.strength : p.strength,
        specialItemKey: o ? o.specialItemKey || null : p.specialItemKey,
        specialItemChance: o ? (o.specialItemChance ?? null) : p.specialItemChance,
      };
      const computed = computePentili(config, own);
      return {
        key: p.key,
        nameKey: p.nameKey,
        zoneKey: p.zone.key,
        orderInZone: p.orderInZone,
        levelOverride: own.levelOverride,
        strength: own.strength,
        specialItemKey: own.specialItemKey,
        specialItemChance: own.specialItemChance,
        current: { level: p.level, maxHp: p.maxHp, attack: p.attack, defense: p.defense, xpReward: p.xpReward },
        next: computed,
      };
    });
    return { config, zones, pentili: rows, items };
  }
}

/** Sanity limits for the buildings/research balance, so a typo can't break the base. */
function validateBuildings(config: BuildingBalanceConfig): BuildingBalanceConfig {
  const bad = (code: string) => new BadRequestException(code);
  const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const p = config.production;
  if (!between(p.metalPerHour, 1, 1_000_000) || !between(p.crystalPerHour, 1, 1_000_000) || !between(p.growth, 1, 2)) throw bad('PRODUCTION_OUT_OF_RANGE');
  if (!between(config.costHours, 0.01, 100)) throw bad('COST_OUT_OF_RANGE');
  if (!between(config.buildTime.base, 1, 100_000) || !between(config.buildTime.growth, 0, 4)) throw bad('TIME_OUT_OF_RANGE');
  for (const b of Object.values(config.buildings)) {
    if (!between(b.metal, 0, 100) || !between(b.crystal, 0, 100) || !between(b.time, 0.01, 100) || !between(b.maxLevel, 1, 100) || !Number.isInteger(b.maxLevel)) {
      throw bad('BUILDING_OUT_OF_RANGE');
    }
    for (const [field, v] of Object.entries(b.effects ?? {})) {
      if (!(BUILDING_EFFECT_FIELDS as readonly string[]).includes(field) || !between(v, 0, 1_000_000)) throw bad('EFFECT_OUT_OF_RANGE');
    }
  }
  const r = config.research;
  if (!between(r.metal, 0, 100) || !between(r.crystal, 0, 100) || !between(r.credits, 0, 100)) throw bad('RESEARCH_OUT_OF_RANGE');
  if (!between(r.time.base, 1, 100_000) || !between(r.time.growth, 0, 4)) throw bad('TIME_OUT_OF_RANGE');
  for (const item of Object.values(r.items)) {
    if (!between(item.bonusPerLevel, 0, 1) || !between(item.maxLevel, 1, 100) || !Number.isInteger(item.maxLevel)) throw bad('RESEARCH_OUT_OF_RANGE');
  }
  return config;
}

const SIMULATION_RUNS = 400;
const DEFAULT_SPLIT: EquipmentSplitDto = { damage: 1, defense: 1, hp: 1, researchAttack: 0, researchHp: 0, forge: 0 };

function validateSplit(split: EquipmentSplitDto | undefined): EquipmentSplitDto {
  if (!split) return DEFAULT_SPLIT;
  const ok = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;
  const s = { ...split, researchAttack: split.researchAttack ?? 0, researchHp: split.researchHp ?? 0, forge: split.forge ?? 0 };
  if (!ok(s.damage) || !ok(s.defense) || !ok(s.hp) || s.damage + s.defense + s.hp <= 0) throw new BadRequestException('SPLIT_OUT_OF_RANGE');
  if (!ok(s.researchAttack) || !ok(s.researchHp) || !ok(s.forge)) throw new BadRequestException('SPLIT_OUT_OF_RANGE');
  return { damage: s.damage, defense: s.defense, hp: s.hp, researchAttack: s.researchAttack, researchHp: s.researchHp, forge: s.forge };
}

function overrideDto(set: OverrideSet): AdminOtherBalanceDto {
  const values = set.current();
  return { values: set.defs.map((d) => ({ ...d, value: values[d.path], default: set.defaults[d.path] })) };
}

/**
 * The preview's reference robot: innate floor + attribute points (spent by
 * `split`) + a full set at `upgrade`, with the same factors as
 * computeCombatBreakdown — attack × (research + Forge + Cantina), defense ×
 * (1 + Forge), HP × research. No Excellent options.
 */
function referenceRobot(equipment: EquipmentBalanceConfig, split: EquipmentSplitDto, level: number, tier: SetTier | null, upgrade: number, tavern = 0) {
  const attrs = GAME_BALANCE.robotAttributes;
  const combat = GAME_BALANCE.combat;
  const total = split.damage + split.defense + split.hp;
  let points = 0;
  for (let l = 2; l <= level; l++) points += attributePointsForLevel(l);
  const gear = { attack: 0, defense: 0, hp: 0 };
  if (tier) {
    const m = 1 + upgrade * equipment.upgrade.bonusPerLevel;
    for (const slot of EQUIPMENT_SLOTS) {
      const s = equipment.sets[tier].slots[slot];
      gear.attack += s.attack * m;
      gear.defense += s.defense * m;
      gear.hp += s.hp * m;
    }
  }
  return {
    attack: (combat.baseAttack + gear.attack + ((points * split.damage) / total) * attrs.damagePointValue) * (1 + split.researchAttack + split.forge + tavern),
    defense: (combat.baseDefense + gear.defense + ((points * split.defense) / total) * attrs.defensePointValue) * (1 + split.forge),
    hp: (combat.basePlayerHp + gear.hp + ((points * split.hp) / total) * attrs.hpPointValue) * (1 + split.researchHp),
    points,
  };
}

const DEFAULT_BOSS_PLAYERS = 3;
const DEFAULT_BOSS_TARGET = 0.8;

/** A boss's example participant before any change: its minimum level, the full zone set at +0, points spread evenly, no bonuses. */
function defaultBossParticipant(level: number): BossParticipantDto {
  return { level, parts: 7, upgrade: 0, damage: 1, defense: 1, hp: 1, researchAttack: 0, researchHp: 0, forge: 0, tavern: 0 };
}

/**
 * The example participant's robot: like referenceRobot, but only `parts`
 * slots wear the zone set at `upgrade` and the rest the previous set at +0
 * (nothing below Pioneer). Slots are averaged (a set's total × parts / 7), so
 * which slots are missing doesn't matter.
 */
function participantRobot(equipment: EquipmentBalanceConfig, tier: SetTier, p: BossParticipantDto) {
  const attrs = GAME_BALANCE.robotAttributes;
  const combat = GAME_BALANCE.combat;
  const previous = SET_TIERS[SET_TIERS.indexOf(tier) - 1] as SetTier | undefined;
  const setTotal = (t: SetTier, upgrade: number) => {
    const k = 1 + upgrade * equipment.upgrade.bonusPerLevel;
    return EQUIPMENT_SLOTS.reduce(
      (sum, slot) => {
        const st = equipment.sets[t].slots[slot];
        return { attack: sum.attack + st.attack * k, defense: sum.defense + st.defense * k, hp: sum.hp + st.hp * k };
      },
      { attack: 0, defense: 0, hp: 0 },
    );
  };
  const main = setTotal(tier, p.upgrade);
  const rest = previous ? setTotal(previous, 0) : { attack: 0, defense: 0, hp: 0 };
  const share = p.parts / EQUIPMENT_SLOTS.length;
  let points = 0;
  for (let l = 2; l <= p.level; l++) points += attributePointsForLevel(l);
  const total = p.damage + p.defense + p.hp;
  const gear = (stat: 'attack' | 'defense' | 'hp') => main[stat] * share + rest[stat] * (1 - share);
  return {
    attack: (combat.baseAttack + gear('attack') + ((points * p.damage) / total) * attrs.damagePointValue) * (1 + p.researchAttack + p.forge + p.tavern),
    defense: (combat.baseDefense + gear('defense') + ((points * p.defense) / total) * attrs.defensePointValue) * (1 + p.forge),
    hp: (combat.basePlayerHp + gear('hp') + ((points * p.hp) / total) * attrs.hpPointValue) * (1 + p.researchHp),
  };
}

/** HP, attack and defense scaled together until the party wins about `target`; null if it can't even beat a very weak boss. */
function suggestBossStrength(
  party: { attack: number; defense: number; hp: number },
  boss: { maxHp: number; attack: number; defense: number },
  target: number,
): AdminBossRowDto['suggestion'] {
  const scaled = (f: number) => ({ maxHp: Math.max(1, Math.round(boss.maxHp * f)), attack: Math.round(boss.attack * f), defense: Math.round(boss.defense * f) });
  let low = 0.02;
  let high = 20;
  if (winRate(party, scaled(low)) / 100 < target) return null;
  // A stronger boss wins more often: halve the range until the share is close to the target.
  for (let i = 0; i < 16; i++) {
    const mid = Math.sqrt(low * high);
    if (winRate(party, scaled(mid)) / 100 >= target) low = mid;
    else high = mid;
  }
  const stats = scaled(low);
  return { ...stats, win: winRate(party, stats) };
}

/** Sanity limits for the preview's participants, player count and target. */
function validateBossPreview(
  dto: SaveBossBalanceDto,
  config: BossBalanceConfig,
): { participants: Record<string, BossParticipantDto>; players: number; target: number } {
  const bad = () => new BadRequestException('PARTICIPANT_OUT_OF_RANGE');
  const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const int = (x: unknown, min: number, max: number) => between(x, min, max) && Number.isInteger(x);
  const players = dto.players ?? DEFAULT_BOSS_PLAYERS;
  const target = dto.target ?? DEFAULT_BOSS_TARGET;
  if (!int(players, 1, 5) || !between(target, 0.01, 0.99)) throw bad();
  const participants: Record<string, BossParticipantDto> = {};
  for (const [key, p] of Object.entries(dto.participants ?? {})) {
    if (!config.bosses[key]) continue;
    if (!int(p.level, 1, 100) || !int(p.parts, 0, 7) || !int(p.upgrade, 0, 100)) throw bad();
    if (!between(p.damage, 0, 100) || !between(p.defense, 0, 100) || !between(p.hp, 0, 100) || p.damage + p.defense + p.hp <= 0) throw bad();
    if (!between(p.researchAttack, 0, 10) || !between(p.researchHp, 0, 10) || !between(p.forge, 0, 10) || !between(p.tavern, 0, 10)) throw bad();
    participants[key] = {
      level: p.level,
      parts: p.parts,
      upgrade: p.upgrade,
      damage: p.damage,
      defense: p.defense,
      hp: p.hp,
      researchAttack: p.researchAttack,
      researchHp: p.researchHp,
      forge: p.forge,
      tavern: p.tavern,
    };
  }
  return { participants, players, target };
}

/** Share of SIMULATION_RUNS real fights won, in %. */
function winRate(stats: { attack: number; defense: number; hp: number }, opponent: { attack: number; defense: number; maxHp: number }): number {
  let wins = 0;
  for (let i = 0; i < SIMULATION_RUNS; i++) if (simulateCombat({ ...stats, evasion: 0 }, opponent).won) wins++;
  return Math.round((wins / SIMULATION_RUNS) * 1000) / 10;
}

/** Sanity limits for the bosses balance. */
function validateBosses(config: BossBalanceConfig): BossBalanceConfig {
  const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const int = (x: unknown, min: number, max: number) => between(x, min, max) && Number.isInteger(x);
  const bad = () => new BadRequestException('BOSS_OUT_OF_RANGE');
  for (const b of Object.values(config.bosses ?? {})) {
    if (!int(b.minLevel, 1, 100) || !int(b.maxHp, 1, 100_000_000) || !int(b.attack, 0, 10_000_000) || !int(b.defense, 0, 10_000_000) || !int(b.xpReward, 0, 1_000_000_000)) throw bad();
    if (typeof b.boxKey !== 'string' || !between(b.resourceFights, 0, 10_000)) throw bad();
    if (!between(b.credits.chance, 0, 1) || !int(b.credits.min, 0, 1_000_000) || !int(b.credits.max, 0, 1_000_000) || b.credits.min > b.credits.max) throw bad();
    if (!Array.isArray(b.items) || b.items.length > 20) throw bad();
    for (const i of b.items) {
      if (typeof i.itemKey !== 'string' || !between(i.chance, 0, 1) || !int(i.min, 0, 1000) || !int(i.max, 0, 1000) || i.min > i.max) throw bad();
    }
  }
  return config;
}

/** Sanity limits for the expeditions balance. */
function validateExpeditions(config: ExpeditionBalanceConfig): ExpeditionBalanceConfig {
  const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  for (const e of Object.values(config.expeditions ?? {})) {
    if (!between(e.durationMinutes, 1, 10_080) || !Number.isInteger(e.durationMinutes) || !between(e.fights, 0, 10_000) || !between(e.bonusItemChance, 0, 1)) {
      throw new BadRequestException('EXPEDITION_OUT_OF_RANGE');
    }
    if (!between(e.requiredNavigationLevel, 0, 100) || !Number.isInteger(e.requiredNavigationLevel)) throw new BadRequestException('EXPEDITION_OUT_OF_RANGE');
  }
  if (!between(config.earlyCancelPercentage, 0, 1)) throw new BadRequestException('EXPEDITION_OUT_OF_RANGE');
  return config;
}

/** Sanity limits for the equipment balance. */
function validateEquipment(config: EquipmentBalanceConfig): EquipmentBalanceConfig {
  const bad = (code: string) => new BadRequestException(code);
  const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  for (const tier of SET_TIERS) {
    const set = config.sets?.[tier];
    if (!set || !between(set.maxUpgradeLevel, 0, 50) || !Number.isInteger(set.maxUpgradeLevel)) throw bad('SET_OUT_OF_RANGE');
    if (!between(set.sellMetal, 0, 10_000_000) || !between(set.sellCrystal, 0, 10_000_000)) throw bad('SET_OUT_OF_RANGE');
    for (const slot of EQUIPMENT_SLOTS) {
      const s = set.slots?.[slot];
      if (!s || !between(s.attack, 0, 100_000) || !between(s.defense, 0, 100_000) || !between(s.hp, 0, 1_000_000)) throw bad('STATS_OUT_OF_RANGE');
    }
  }
  const u = config.upgrade;
  if (!between(u.bonusPerLevel, 0, 1) || !between(u.materialsPerLevel, 0.1, 100) || !between(u.fragmentsPerStone, 1, 1000) || !Number.isInteger(u.fragmentsPerStone)) {
    throw bad('UPGRADE_OUT_OF_RANGE');
  }
  const q = config.qualitySellMultiplier;
  if (!between(q.NORMAL, 0, 100) || !between(q.RARE, 0, 100) || !between(q.EPIC, 0, 100)) throw bad('SELL_OUT_OF_RANGE');
  return config;
}

/** Sanity limits for the clan balance. */
function validateClan(config: ClanBalanceConfig): ClanBalanceConfig {
  const bad = (code: string) => new BadRequestException(code);
  const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  if (!between(config.costFactor, 0.01, 1000) || !between(config.crystal, 0, 100) || !between(config.credits, 0, 100)) throw bad('COST_OUT_OF_RANGE');
  if (!between(config.buildTime.base, 1, 100_000) || !between(config.buildTime.growth, 0, 4)) throw bad('TIME_OUT_OF_RANGE');
  for (const b of Object.values(config.buildings)) {
    if (!between(b.bonusPerLevel, 0, 1000) || !between(b.maxLevel, 1, 100) || !Number.isInteger(b.maxLevel) || !between(b.levelStep, 0.1, 10) || !between(b.cost, 0.01, 100)) {
      throw bad('BUILDING_OUT_OF_RANGE');
    }
  }
  const t = config.tavern;
  if (!between(t.activationHours, 0.5, 168)) throw bad('TAVERN_OUT_OF_RANGE');
  if (!between(t.activationMetal, 0, 10_000_000) || !between(t.activationCrystal, 0, 10_000_000) || !between(t.activationCredits, 0, 10_000_000)) throw bad('TAVERN_OUT_OF_RANGE');
  if (!Array.isArray(config.generatorMaxEnergyLevels) || !config.generatorMaxEnergyLevels.every((l) => Number.isInteger(l) && l >= 1 && l <= 100)) throw bad('GENERATOR_OUT_OF_RANGE');
  return { ...config, generatorMaxEnergyLevels: [...new Set(config.generatorMaxEnergyLevels)].sort((a, b) => a - b) };
}

function validateXp(config: XpBalanceConfig): XpBalanceConfig {
  if (!(config.base > 0 && config.base <= 100_000) || !(config.growth >= 0 && config.growth <= 5)) throw new BadRequestException('CURVE_OUT_OF_RANGE');
  return { base: config.base, growth: config.growth };
}

function assertAdmin(admin: AdminJwtPayload): void {
  if (admin.role !== 'ADMIN') throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
}

/** Sanity limits, so a typo can't break the game (e.g. 0 HP or a negative chance). */
function validate(config: PentiliBalanceConfig): PentiliBalanceConfig {
  const curves = [config.stats.hp, config.stats.attack, config.stats.defense, config.stats.xp, config.rewards.metal, config.rewards.crystal];
  for (const c of curves) {
    if (!(c.base > 0 && c.base <= 100_000) || !(c.growth >= 0 && c.growth <= 3)) throw new BadRequestException('CURVE_OUT_OF_RANGE');
  }
  const chance = (x: number) => x >= 0 && x <= 1;
  if (!(config.rewards.spread >= 0 && config.rewards.spread < 1)) throw new BadRequestException('REWARD_OUT_OF_RANGE');
  for (const zone of Object.values(config.zones)) {
    if (!(zone.startLevel >= 1 && zone.startLevel <= 100) || !(zone.step >= 0 && zone.step <= 20) || !(zone.strength > 0 && zone.strength <= 10)) {
      throw new BadRequestException('ZONE_OUT_OF_RANGE');
    }
    if (![zone.itemChance, zone.fragmentChance, zone.upgradeStoneChance, zone.energyPackChance].every(chance)) throw new BadRequestException('ZONE_OUT_OF_RANGE');
    if (!['pioneer', 'ascendant', 'coreforged'].includes(zone.itemTier)) throw new BadRequestException('ZONE_OUT_OF_RANGE');
  }
  return config;
}
