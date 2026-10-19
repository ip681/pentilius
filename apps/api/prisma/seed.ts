import { Prisma, PrismaClient } from '@prisma/client';
import { applyPentiliBalance, DEFAULT_PENTILI_BALANCE, loadPentiliBalance, PENTILI_BALANCE_KEY } from '../src/config/pentili-balance';
import { applyBuildingBalance, BUILDING_BALANCE_KEY, DEFAULT_BUILDING_BALANCE, loadBuildingBalance, niceRound } from '../src/config/building-balance';
import { applyClanBalance, CLAN_BALANCE_KEY, DEFAULT_CLAN_BALANCE, loadClanBalance } from '../src/config/clan-balance';
import { applyEquipmentBalance, DEFAULT_EQUIPMENT_BALANCE, EQUIPMENT_BALANCE_KEY, loadEquipmentBalance } from '../src/config/equipment-balance';
import { applyExpeditionBalance, DEFAULT_EXPEDITION_BALANCE, EXPEDITION_BALANCE_KEY, loadExpeditionBalance } from '../src/config/expedition-balance';
import { applyBossBalance, BOSS_BALANCE_KEY, DEFAULT_BOSS_BALANCE, loadBossBalance } from '../src/config/boss-balance';
import { applyXpBalance, DEFAULT_XP_BALANCE, loadXpBalance, XP_BALANCE_KEY } from '../src/config/xp-balance';

const prisma = new PrismaClient();

/**
 * Static content for Milestones 1-2. Numeric balance values here (costs,
 * timers, drop chances, XP thresholds, zone unlock levels) are placeholders
 * standing in for design decisions marked UNDEFINED in
 * instructions/GAME_SYSTEMS.md and instructions/OPEN_DECISIONS.md — see that
 * file for the running list. They exist only so the game is playable
 * end-to-end; retune here, not in code, once real values are decided.
 */
async function main() {
  // Owner decision (2026-10-11, alongside the level-100 cap): unlock levels
  // spread across the new wider range — 1 / 20 / 40 / 60 (previously 1 / 3 /
  // 6 / 9 under the old 1-14 curve). `update` is no longer `{}` — these zones
  // already exist in every already-seeded database (local and production),
  // so an upsert with an empty update would silently leave the old unlock
  // levels in place forever instead of applying the new ones.
  const [zoneVerdant, zoneAshen, zoneCrimson, zoneFrostbound] = await Promise.all([
    prisma.zone.upsert({
      where: { key: 'zone_verdant_flats' },
      update: { unlockLevel: 1 },
      create: { key: 'zone_verdant_flats', nameKey: 'zones.verdant_flats.name', order: 1, unlockLevel: 1, iconAssetId: 'zones.verdant_flats.icon' },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_ashen_ridge' },
      update: { unlockLevel: 20 },
      create: { key: 'zone_ashen_ridge', nameKey: 'zones.ashen_ridge.name', order: 2, unlockLevel: 20, iconAssetId: 'zones.ashen_ridge.icon' },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_crimson_wastes' },
      update: { unlockLevel: 40 },
      create: { key: 'zone_crimson_wastes', nameKey: 'zones.crimson_wastes.name', order: 3, unlockLevel: 40, iconAssetId: 'zones.crimson_wastes.icon' },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_frostbound_reach' },
      update: { unlockLevel: 60 },
      create: { key: 'zone_frostbound_reach', nameKey: 'zones.frostbound_reach.name', order: 4, unlockLevel: 60, iconAssetId: 'zones.frostbound_reach.icon' },
    }),
  ]);

  // Owner decision (2026-10-11): reuse all 8 existing Pentili "looks" (name +
  // icon) in every zone instead of commissioning new art — each zone gets a
  // full 10-entry roster (all 8 creature types, power-ordered, plus the top
  // 2 — Voidling/Stormcaller — repeated once more as a second, stronger
  // encounter), with stats/level scaled to that zone's own slice of the new
  // 1-100 level range. A Pentili's own `level` field doubles as its reveal
  // gate within an already-unlocked zone (zones.service.ts filters by
  // `player.level >= pentili.level`) — no separate "unlockLevel" column,
  // since the two would always hold the same number. Display is just
  // "(Lv. X)", no "Elite" wording, per owner decision.
  //
  // The original 8 keys below KEEP their original zoneId — only their
  // level/stats move to fit the new range — specifically so their existing
  // tier-matched loot tables (Pioneer/Ascendant/Coreforged, further down)
  // stay correct. Every "borrowed" appearance of a creature in a zone it
  // doesn't canonically belong to is a brand-new key below, so it can get
  // its own zone-appropriate loot later rather than inheriting a mismatched
  // tier. Stats follow a provisional power-law fit against the original 8
  // values (HP=20*Lv^1.07, ATK=4*Lv^0.916, DEF=Lv^1.249, XP=8*Lv^1.3) — a
  // first pass, not a final balance decision (see OPEN_DECISIONS.md).
  // Loot drops for the 32 new entries are intentionally left empty for now —
  // deferred, not part of this change.
  const pentiliData = [
    // Zone 1 — Verdant Flats (Pioneer loot tier)
    { key: 'pentili_skitterling', nameKey: 'pentili.skitterling.name', zoneId: zoneVerdant.id, level: 1, maxHp: 20, attack: 4, defense: 1, xpReward: 8, iconAssetId: 'pentili.skitterling.icon' },
    { key: 'pentili_mossback', nameKey: 'pentili.mossback.name', zoneId: zoneVerdant.id, level: 3, maxHp: 65, attack: 11, defense: 4, xpReward: 33, iconAssetId: 'pentili.mossback.icon' },
    { key: 'pentili_ridgefang_z1', nameKey: 'pentili.ridgefang.name', zoneId: zoneVerdant.id, level: 5, maxHp: 112, attack: 17, defense: 7, xpReward: 65, iconAssetId: 'pentili.ridgefang.icon' },
    { key: 'pentili_cinderclaw_z1', nameKey: 'pentili.cinderclaw.name', zoneId: zoneVerdant.id, level: 7, maxHp: 160, attack: 24, defense: 11, xpReward: 100, iconAssetId: 'pentili.cinderclaw.icon' },
    { key: 'pentili_duskfang_z1', nameKey: 'pentili.duskfang.name', zoneId: zoneVerdant.id, level: 9, maxHp: 210, attack: 30, defense: 16, xpReward: 139, iconAssetId: 'pentili.duskfang.icon' },
    { key: 'pentili_voidling_z1', nameKey: 'pentili.voidling.name', zoneId: zoneVerdant.id, level: 11, maxHp: 260, attack: 36, defense: 20, xpReward: 181, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_glacialwraith_z1', nameKey: 'pentili.glacialwraith.name', zoneId: zoneVerdant.id, level: 13, maxHp: 311, attack: 42, defense: 25, xpReward: 224, iconAssetId: 'pentili.glacialwraith.icon' },
    { key: 'pentili_stormcaller_z1', nameKey: 'pentili.stormcaller.name', zoneId: zoneVerdant.id, level: 15, maxHp: 363, attack: 48, defense: 29, xpReward: 270, iconAssetId: 'pentili.stormcaller.icon' },
    { key: 'pentili_voidling_z1b', nameKey: 'pentili.voidling.name', zoneId: zoneVerdant.id, level: 17, maxHp: 415, attack: 54, defense: 34, xpReward: 318, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_stormcaller_z1b', nameKey: 'pentili.stormcaller.name', zoneId: zoneVerdant.id, level: 19, maxHp: 467, attack: 59, defense: 40, xpReward: 368, iconAssetId: 'pentili.stormcaller.icon' },

    // Zone 2 — Ashen Ridge (Ascendant loot tier)
    { key: 'pentili_skitterling_z2', nameKey: 'pentili.skitterling.name', zoneId: zoneAshen.id, level: 20, maxHp: 493, attack: 62, defense: 42, xpReward: 393, iconAssetId: 'pentili.skitterling.icon' },
    { key: 'pentili_mossback_z2', nameKey: 'pentili.mossback.name', zoneId: zoneAshen.id, level: 22, maxHp: 546, attack: 68, defense: 47, xpReward: 445, iconAssetId: 'pentili.mossback.icon' },
    { key: 'pentili_ridgefang', nameKey: 'pentili.ridgefang.name', zoneId: zoneAshen.id, level: 24, maxHp: 600, attack: 74, defense: 53, xpReward: 498, iconAssetId: 'pentili.ridgefang.icon' },
    { key: 'pentili_cinderclaw', nameKey: 'pentili.cinderclaw.name', zoneId: zoneAshen.id, level: 26, maxHp: 653, attack: 79, defense: 59, xpReward: 553, iconAssetId: 'pentili.cinderclaw.icon' },
    { key: 'pentili_duskfang_z2', nameKey: 'pentili.duskfang.name', zoneId: zoneAshen.id, level: 28, maxHp: 707, attack: 85, defense: 64, xpReward: 609, iconAssetId: 'pentili.duskfang.icon' },
    { key: 'pentili_voidling_z2', nameKey: 'pentili.voidling.name', zoneId: zoneAshen.id, level: 30, maxHp: 761, attack: 90, defense: 70, xpReward: 666, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_glacialwraith_z2', nameKey: 'pentili.glacialwraith.name', zoneId: zoneAshen.id, level: 32, maxHp: 816, attack: 96, defense: 76, xpReward: 724, iconAssetId: 'pentili.glacialwraith.icon' },
    { key: 'pentili_stormcaller_z2', nameKey: 'pentili.stormcaller.name', zoneId: zoneAshen.id, level: 34, maxHp: 870, attack: 101, defense: 82, xpReward: 783, iconAssetId: 'pentili.stormcaller.icon' },
    { key: 'pentili_voidling_z2b', nameKey: 'pentili.voidling.name', zoneId: zoneAshen.id, level: 36, maxHp: 925, attack: 107, defense: 88, xpReward: 844, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_stormcaller_z2b', nameKey: 'pentili.stormcaller.name', zoneId: zoneAshen.id, level: 38, maxHp: 980, attack: 112, defense: 94, xpReward: 905, iconAssetId: 'pentili.stormcaller.icon' },

    // Zone 3 — Crimson Wastes (Coreforged loot tier)
    { key: 'pentili_skitterling_z3', nameKey: 'pentili.skitterling.name', zoneId: zoneCrimson.id, level: 40, maxHp: 1036, attack: 117, defense: 100, xpReward: 968, iconAssetId: 'pentili.skitterling.icon' },
    { key: 'pentili_mossback_z3', nameKey: 'pentili.mossback.name', zoneId: zoneCrimson.id, level: 42, maxHp: 1091, attack: 123, defense: 107, xpReward: 1031, iconAssetId: 'pentili.mossback.icon' },
    { key: 'pentili_ridgefang_z3', nameKey: 'pentili.ridgefang.name', zoneId: zoneCrimson.id, level: 44, maxHp: 1147, attack: 128, defense: 113, xpReward: 1095, iconAssetId: 'pentili.ridgefang.icon' },
    { key: 'pentili_cinderclaw_z3', nameKey: 'pentili.cinderclaw.name', zoneId: zoneCrimson.id, level: 46, maxHp: 1203, attack: 133, defense: 119, xpReward: 1161, iconAssetId: 'pentili.cinderclaw.icon' },
    { key: 'pentili_duskfang', nameKey: 'pentili.duskfang.name', zoneId: zoneCrimson.id, level: 48, maxHp: 1259, attack: 139, defense: 126, xpReward: 1227, iconAssetId: 'pentili.duskfang.icon' },
    { key: 'pentili_voidling', nameKey: 'pentili.voidling.name', zoneId: zoneCrimson.id, level: 50, maxHp: 1315, attack: 144, defense: 132, xpReward: 1293, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_glacialwraith_z3', nameKey: 'pentili.glacialwraith.name', zoneId: zoneCrimson.id, level: 52, maxHp: 1371, attack: 149, defense: 139, xpReward: 1361, iconAssetId: 'pentili.glacialwraith.icon' },
    { key: 'pentili_stormcaller_z3', nameKey: 'pentili.stormcaller.name', zoneId: zoneCrimson.id, level: 54, maxHp: 1428, attack: 155, defense: 146, xpReward: 1430, iconAssetId: 'pentili.stormcaller.icon' },
    { key: 'pentili_voidling_z3b', nameKey: 'pentili.voidling.name', zoneId: zoneCrimson.id, level: 56, maxHp: 1485, attack: 160, defense: 153, xpReward: 1499, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_stormcaller_z3b', nameKey: 'pentili.stormcaller.name', zoneId: zoneCrimson.id, level: 58, maxHp: 1541, attack: 165, defense: 159, xpReward: 1569, iconAssetId: 'pentili.stormcaller.icon' },

    // Zone 4 — Frostbound Reach (Coreforged loot tier continues)
    { key: 'pentili_skitterling_z4', nameKey: 'pentili.skitterling.name', zoneId: zoneFrostbound.id, level: 60, maxHp: 1598, attack: 170, defense: 166, xpReward: 1639, iconAssetId: 'pentili.skitterling.icon' },
    { key: 'pentili_mossback_z4', nameKey: 'pentili.mossback.name', zoneId: zoneFrostbound.id, level: 64, maxHp: 1713, attack: 181, defense: 180, xpReward: 1783, iconAssetId: 'pentili.mossback.icon' },
    { key: 'pentili_ridgefang_z4', nameKey: 'pentili.ridgefang.name', zoneId: zoneFrostbound.id, level: 68, maxHp: 1827, attack: 191, defense: 194, xpReward: 1929, iconAssetId: 'pentili.ridgefang.icon' },
    { key: 'pentili_cinderclaw_z4', nameKey: 'pentili.cinderclaw.name', zoneId: zoneFrostbound.id, level: 72, maxHp: 1943, attack: 201, defense: 209, xpReward: 2078, iconAssetId: 'pentili.cinderclaw.icon' },
    { key: 'pentili_duskfang_z4', nameKey: 'pentili.duskfang.name', zoneId: zoneFrostbound.id, level: 76, maxHp: 2058, attack: 211, defense: 223, xpReward: 2229, iconAssetId: 'pentili.duskfang.icon' },
    { key: 'pentili_voidling_z4', nameKey: 'pentili.voidling.name', zoneId: zoneFrostbound.id, level: 80, maxHp: 2174, attack: 221, defense: 238, xpReward: 2383, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_glacialwraith', nameKey: 'pentili.glacialwraith.name', zoneId: zoneFrostbound.id, level: 84, maxHp: 2291, attack: 232, defense: 253, xpReward: 2539, iconAssetId: 'pentili.glacialwraith.icon' },
    { key: 'pentili_stormcaller', nameKey: 'pentili.stormcaller.name', zoneId: zoneFrostbound.id, level: 88, maxHp: 2408, attack: 242, defense: 268, xpReward: 2697, iconAssetId: 'pentili.stormcaller.icon' },
    { key: 'pentili_voidling_z4b', nameKey: 'pentili.voidling.name', zoneId: zoneFrostbound.id, level: 92, maxHp: 2525, attack: 252, defense: 284, xpReward: 2858, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_stormcaller_z4b', nameKey: 'pentili.stormcaller.name', zoneId: zoneFrostbound.id, level: 96, maxHp: 2643, attack: 262, defense: 299, xpReward: 3020, iconAssetId: 'pentili.stormcaller.icon' },
  ];
  // Since 2026-10-18 the stats, XP and loot come from the Pentili balance
  // edited in godmaster (src/config/pentili-balance.ts): the seed only
  // creates missing Pentili with their place in the zone and keeps names,
  // zones and icons in step — it never overwrites the balance.
  const orderInZone = new Map<string, number>();
  for (const data of pentiliData) {
    const order = orderInZone.get(data.zoneId) ?? 0;
    orderInZone.set(data.zoneId, order + 1);
    await prisma.pentili.upsert({
      where: { key: data.key },
      update: { nameKey: data.nameKey, zoneId: data.zoneId, iconAssetId: data.iconAssetId },
      create: { ...data, orderInZone: order },
    });
  }

  const buildingTypes = await Promise.all(
    [
      { key: 'metal_mine', nameKey: 'buildings.metal_mine.name', maxLevel: 30, iconAssetId: 'buildings.metal_mine.icon' },
      {
        key: 'crystal_extractor',
        nameKey: 'buildings.crystal_extractor.name',
        maxLevel: 30,
        iconAssetId: 'buildings.crystal_extractor.icon',
      },
      // capacityBonusPerLevel: raises personal inventory capacity — owner
      // decision, resolving the Warehouse's previous lack of any coded effect.
      { key: 'warehouse', nameKey: 'buildings.warehouse.name', maxLevel: 30, iconAssetId: 'buildings.warehouse.icon', capacityBonusPerLevel: 2 },
      // marketSlotBonusPerLevel: raises Market listing capacity, base 0 —
      // owner decision, 2026-09-11 (see schema.prisma's comment on
      // BuildingType.marketSlotBonusPerLevel). 0.5 = one listing every 2
      // levels, rounded up (base balance, 2026-10-14).
      { key: 'trading_post', nameKey: 'buildings.trading_post.name', maxLevel: 30, iconAssetId: 'buildings.trading_post.icon', marketSlotBonusPerLevel: 0.5 },
      // Defense System (owner decision, 2026-10-12): drawn as the 4 corner
      // towers of the base's wall frame, reusing the existing guard_tower art.
      // +0.5% defense per level (+15% at level 30; base balance, 2026-10-14),
      // only while this player is being attacked.
      { key: 'defense_system', nameKey: 'buildings.defense_system.name', maxLevel: 30, iconAssetId: 'buildings.guard_tower.icon', defenseBonusPerLevel: 0.005 },
      // Defensive Wall (owner decision, 2026-10-12): drawn as the wall segments
      // of the frame. +2 min/level of regular-PvP revenge protection after a
      // lost defense (base 10 min -> 70 min at level 30; base balance,
      // 2026-10-14). PvP only, not clan war.
      { key: 'defensive_wall', nameKey: 'buildings.defensive_wall.name', maxLevel: 30, iconAssetId: 'buildings.defensive_wall.icon', pvpProtectionMinutesPerLevel: 2 },
      // Hideout (owner decision, 2026-10-12): this much of each resource can't
      // be stolen when losing a defense (PvP and clan-war duels). Metal and
      // Crystal grow like mine production (building-effects.ts), so the
      // Hideout always shields ~3 hours of that level's income (base balance,
      // 2026-10-14). Credits are never stolen (2026-10-19), so none here.
      {
        key: 'hideout',
        nameKey: 'buildings.hideout.name',
        maxLevel: 30,
        iconAssetId: 'buildings.hideout.icon',
        protectedMetalPerLevel: 300,
        protectedCrystalPerLevel: 180,
      },
      // New buildings (owner decision, 2026-10-14) — placeholder numbers.
      // Research Center: researches up to its level; low levels unlock the longer expeditions.
      { key: 'research_center', nameKey: 'buildings.research_center.name', maxLevel: 30, iconAssetId: 'buildings.research_center.icon', researchCapPerLevel: 1 },
      // Exchange: Metal <-> Crystal for a small Credits fee. The daily limit
      // grows like mine production (~10 hours of Metal income per day).
      { key: 'exchange', nameKey: 'buildings.exchange.name', maxLevel: 30, iconAssetId: 'buildings.exchange.icon', exchangeLimitPerLevel: 1000 },
      // Reactor: +1% faster energy regeneration per level, +1 max energy every 10 levels.
      { key: 'reactor', nameKey: 'buildings.reactor.name', maxLevel: 30, iconAssetId: 'buildings.reactor.icon', energyRegenBonusPerLevel: 0.01, maxEnergyBonusEvery: 10 },
      // update: data (not {}) — capacityBonusPerLevel/marketSlotBonusPerLevel
      // must follow this list when it changes, not freeze at whatever an
      // existing row already has.
    // Since 2026-10-19 max level and effects are balanced in godmaster
    // (src/config/building-balance.ts): existing rows only get their name/icon here.
    ].map((data) => prisma.buildingType.upsert({ where: { key: data.key }, update: { nameKey: data.nameKey, iconAssetId: data.iconAssetId }, create: data })),
  );

  // Building costs, times, production and effects are generated after the
  // research types below (src/config/building-balance.ts — godmaster → Balance).

  // The old starter/advanced/elite catalog is fully superseded by the 3 named
  // sets below — clear out its ItemInstance rows (any equipped/inventory copy
  // a player held) and ItemDefinition rows so re-running this seed doesn't
  // leave both the old and new catalogs granting starter kits side by side.
  const obsoleteItemKeys = [
    'head_scanner_mk1', 'left_arm_blaster_mk1', 'right_arm_guard_mk1', 'armor_plating_mk1', 'core_battery_mk1', 'left_leg_actuator_mk1', 'right_leg_actuator_mk1',
    'head_targeting_array', 'left_arm_pulse_cannon', 'right_arm_kinetic_shield', 'armor_reinforced_plating', 'core_fusion_battery', 'left_leg_servo_drive', 'right_leg_servo_drive',
    'right_arm_railgun', 'armor_titan_plating',
  ];
  const obsoleteItems = await prisma.itemDefinition.findMany({ where: { key: { in: obsoleteItemKeys } } });
  if (obsoleteItems.length > 0) {
    const obsoleteIds = obsoleteItems.map((item) => item.id);
    await prisma.itemInstance.deleteMany({ where: { itemDefinitionId: { in: obsoleteIds } } });
    await prisma.itemDefinition.deleteMany({ where: { id: { in: obsoleteIds } } });
  }

  // 3 named equipment sets (instructions/GAME_SYSTEMS.md), 7 slots each, same
  // part-type word per slot across tiers ("<Set> Head Scanner") — stats double
  // each tier. Coreforged's Armor numbers intentionally land on the old
  // elite armor_titan_plating values as a sanity check on the 2x/2x curve.
  const equipmentData = [
    // Pioneer — starter tier (instructions/GAME_SYSTEMS.md). No longer granted
    // free at registration (owner decision, 2026-09-09) — reached via this
    // zone's own PvE loot or the Shop instead; see auth.service.ts's register().
    { key: 'pioneer_head_scanner', slot: 'HEAD' as const, tier: 'PIONEER' as const, baseStats: { attack: 1 }, maxUpgradeLevel: 5 },
    { key: 'pioneer_left_arm_blaster', slot: 'LEFT_ARM' as const, tier: 'PIONEER' as const, baseStats: { attack: 5 }, maxUpgradeLevel: 5 },
    { key: 'pioneer_right_arm_guard', slot: 'RIGHT_ARM' as const, tier: 'PIONEER' as const, baseStats: { defense: 5 }, maxUpgradeLevel: 5 },
    { key: 'pioneer_armor_plating', slot: 'ARMOR' as const, tier: 'PIONEER' as const, baseStats: { hp: 15, defense: 2 }, maxUpgradeLevel: 5 },
    { key: 'pioneer_core_battery', slot: 'CORE' as const, tier: 'PIONEER' as const, baseStats: { attack: 2, defense: 2 }, maxUpgradeLevel: 5 },
    { key: 'pioneer_left_leg_actuator', slot: 'LEFT_LEG' as const, tier: 'PIONEER' as const, baseStats: { hp: 5 }, maxUpgradeLevel: 5 },
    { key: 'pioneer_right_leg_actuator', slot: 'RIGHT_LEG' as const, tier: 'PIONEER' as const, baseStats: { hp: 5 }, maxUpgradeLevel: 5 },
    // Ascendant — advanced tier, 2x Pioneer.
    { key: 'ascendant_head_scanner', slot: 'HEAD' as const, tier: 'ASCENDANT' as const, baseStats: { attack: 4 }, maxUpgradeLevel: 8 },
    { key: 'ascendant_left_arm_blaster', slot: 'LEFT_ARM' as const, tier: 'ASCENDANT' as const, baseStats: { attack: 12 }, maxUpgradeLevel: 8 },
    { key: 'ascendant_right_arm_guard', slot: 'RIGHT_ARM' as const, tier: 'ASCENDANT' as const, baseStats: { defense: 10 }, maxUpgradeLevel: 8 },
    { key: 'ascendant_armor_plating', slot: 'ARMOR' as const, tier: 'ASCENDANT' as const, baseStats: { hp: 30, defense: 5 }, maxUpgradeLevel: 8 },
    { key: 'ascendant_core_battery', slot: 'CORE' as const, tier: 'ASCENDANT' as const, baseStats: { attack: 6, defense: 4 }, maxUpgradeLevel: 8 },
    { key: 'ascendant_left_leg_actuator', slot: 'LEFT_LEG' as const, tier: 'ASCENDANT' as const, baseStats: { hp: 20 }, maxUpgradeLevel: 8 },
    { key: 'ascendant_right_leg_actuator', slot: 'RIGHT_LEG' as const, tier: 'ASCENDANT' as const, baseStats: { hp: 20 }, maxUpgradeLevel: 8 },
    // Coreforged — elite tier, 2x Ascendant. Race-locked per dropped instance
    // (ItemInstance.race), rolled by inventory-capacity.ts's grantItem — not here.
    { key: 'coreforged_head_scanner', slot: 'HEAD' as const, tier: 'COREFORGED' as const, baseStats: { attack: 8 }, maxUpgradeLevel: 10 },
    { key: 'coreforged_left_arm_blaster', slot: 'LEFT_ARM' as const, tier: 'COREFORGED' as const, baseStats: { attack: 24 }, maxUpgradeLevel: 10 },
    { key: 'coreforged_right_arm_guard', slot: 'RIGHT_ARM' as const, tier: 'COREFORGED' as const, baseStats: { defense: 20 }, maxUpgradeLevel: 10 },
    { key: 'coreforged_armor_plating', slot: 'ARMOR' as const, tier: 'COREFORGED' as const, baseStats: { hp: 60, defense: 10 }, maxUpgradeLevel: 10 },
    { key: 'coreforged_core_battery', slot: 'CORE' as const, tier: 'COREFORGED' as const, baseStats: { attack: 12, defense: 8 }, maxUpgradeLevel: 10 },
    { key: 'coreforged_left_leg_actuator', slot: 'LEFT_LEG' as const, tier: 'COREFORGED' as const, baseStats: { hp: 40 }, maxUpgradeLevel: 10 },
    { key: 'coreforged_right_leg_actuator', slot: 'RIGHT_LEG' as const, tier: 'COREFORGED' as const, baseStats: { hp: 40 }, maxUpgradeLevel: 10 },
  ].map((item) => ({
    ...item,
    nameKey: `items.${item.key}.name`,
    descriptionKey: `items.${item.key}.description`,
    iconAssetId: `items.${item.key}.icon`,
  }));

  const equipmentKeys = new Set(equipmentData.map((item) => item.key));
  const itemData = [
    ...equipmentData,
    // Consumables (general inventory, owner decision) — no slot, stack in one
    // ItemInstance row via quantity. baseStats holds { energy } instead of
    // combat stats — read by inventory.service.ts's useConsumable().
    { key: 'energy_pack_small', nameKey: 'items.energy_pack_small.name', descriptionKey: 'items.energy_pack_small.description', slot: null, category: 'CONSUMABLE' as const, baseStats: { energy: 5 }, maxUpgradeLevel: 0, iconAssetId: 'items.energy_pack_small.icon' },
    { key: 'energy_pack_large', nameKey: 'items.energy_pack_large.name', descriptionKey: 'items.energy_pack_large.description', slot: null, category: 'CONSUMABLE' as const, baseStats: { energy: 10 }, maxUpgradeLevel: 0, iconAssetId: 'items.energy_pack_large.icon' },
    // baseStats holds { buildTimeReductionMinutes } — read by inventory.service.ts's
    // useConsumable(), which requires a target buildingKey and shortens that building's
    // active construction timer. Minute values are owner-specified placeholders, tunable here.
    {
      key: 'construction_speedup_small',
      nameKey: 'items.construction_speedup_small.name',
      descriptionKey: 'items.construction_speedup_small.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      baseStats: { buildTimeReductionMinutes: 5 },
      maxUpgradeLevel: 0,
      iconAssetId: 'items.construction_speedup_small.icon',    },
    {
      key: 'construction_speedup_large',
      nameKey: 'items.construction_speedup_large.name',
      descriptionKey: 'items.construction_speedup_large.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      baseStats: { buildTimeReductionMinutes: 10 },
      maxUpgradeLevel: 0,
      iconAssetId: 'items.construction_speedup_large.icon',    },
    // Tier-specific upgrade materials (owner decision) — replace the old
    // generic Upgrade Stones resource. Spent by inventory.service.ts's
    // upgradeItem(), keyed off the item being upgraded's own tier.
    {
      key: 'pioneer_upgrade',
      nameKey: 'items.pioneer_upgrade.name',
      descriptionKey: 'items.pioneer_upgrade.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'PIONEER' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.pioneer_upgrade.icon',    },
    {
      key: 'ascendant_upgrade',
      nameKey: 'items.ascendant_upgrade.name',
      descriptionKey: 'items.ascendant_upgrade.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'ASCENDANT' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.ascendant_upgrade.icon',    },
    {
      key: 'coreforged_upgrade',
      nameKey: 'items.coreforged_upgrade.name',
      descriptionKey: 'items.coreforged_upgrade.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'COREFORGED' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.coreforged_upgrade.icon',    },
    // Recycling materials (owner decision) — an alternative to selling an
    // EQUIPMENT item for Metal/Crystal. Recycling grants one of these per tier
    // instead; 20 of them auto-convert into the tier's own upgrade material
    // above. See inventory.service.ts's recycleItem().
    {
      key: 'pioneer_fragment',
      nameKey: 'items.pioneer_fragment.name',
      descriptionKey: 'items.pioneer_fragment.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'PIONEER' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.pioneer_fragment.icon',    },
    {
      key: 'ascendant_fragment',
      nameKey: 'items.ascendant_fragment.name',
      descriptionKey: 'items.ascendant_fragment.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'ASCENDANT' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.ascendant_fragment.icon',    },
    {
      key: 'coreforged_fragment',
      nameKey: 'items.coreforged_fragment.name',
      descriptionKey: 'items.coreforged_fragment.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'COREFORGED' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.coreforged_fragment.icon',    },
    // Loot boxes (owner decision) — stackable, opened via inventory.service.ts's
    // openBox() for a guaranteed RARE/EPIC item of the matching tier
    // (GAME_BALANCE.boxOpen). Not droppable yet — Shop-only for now, since every
    // ItemDefinition is automatically listed there.
    {
      key: 'pioneer_box',
      nameKey: 'items.pioneer_box.name',
      descriptionKey: 'items.pioneer_box.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'PIONEER' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.pioneer_box.icon',    },
    {
      key: 'ascendant_box',
      nameKey: 'items.ascendant_box.name',
      descriptionKey: 'items.ascendant_box.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'ASCENDANT' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.ascendant_box.icon',    },
    {
      key: 'coreforged_box',
      nameKey: 'items.coreforged_box.name',
      descriptionKey: 'items.coreforged_box.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'COREFORGED' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.coreforged_box.icon',    },
  ];
  // System Shop (owner decision, testing-phase only) — cycles through every
  // non-empty combination of the 3 currencies at 1 unit each, so the Shop UI
  // can be exercised against every price-display case before real per-item
  // prices are set. See instructions/OPEN_DECISIONS.md.
  const SHOP_PRICE_COMBOS = [
    { shopPriceMetal: 1, shopPriceCrystal: 0, shopPriceCredits: 0 },
    { shopPriceMetal: 0, shopPriceCrystal: 1, shopPriceCredits: 0 },
    { shopPriceMetal: 0, shopPriceCrystal: 0, shopPriceCredits: 1 },
    { shopPriceMetal: 1, shopPriceCrystal: 1, shopPriceCredits: 0 },
    { shopPriceMetal: 1, shopPriceCrystal: 0, shopPriceCredits: 1 },
    { shopPriceMetal: 0, shopPriceCrystal: 1, shopPriceCredits: 1 },
    { shopPriceMetal: 1, shopPriceCrystal: 1, shopPriceCredits: 1 },
  ];
  const itemsByKey: Record<string, Awaited<ReturnType<typeof prisma.itemDefinition.upsert>>> = {};
  for (const [index, data] of itemData.entries()) {
    // update: data (not {}) — category/slot/baseStats must follow this list
    // when it changes, not freeze at whatever an existing row already has.
    const priced = { ...data, ...SHOP_PRICE_COMBOS[index % SHOP_PRICE_COMBOS.length] };
    // Set items' stats and max upgrade come from the equipment balance in
    // godmaster since 2026-10-19 — not overwritten here (the list's values
    // only matter for a new database, and equal the defaults).
    const { baseStats, maxUpgradeLevel, ...rest } = priced;
    const update = equipmentKeys.has(data.key) ? rest : { ...rest, baseStats, maxUpgradeLevel };
    itemsByKey[data.key] = await prisma.itemDefinition.upsert({ where: { key: data.key }, update, create: priced });
  }

  // Equipment sets from the balance (owner decision, 2026-10-19): save the
  // defaults once if nothing is saved yet, then apply.
  await prisma.balanceConfig.upsert({
    where: { key: EQUIPMENT_BALANCE_KEY },
    update: {},
    create: { key: EQUIPMENT_BALANCE_KEY, data: DEFAULT_EQUIPMENT_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyEquipmentBalance(prisma, await loadEquipmentBalance(prisma));

  // Pentili stats, XP and loot from the balance (owner decision, 2026-10-18):
  // save the defaults once if nothing is saved yet, then generate. The seed
  // never overwrites a balance saved in godmaster.
  await prisma.balanceConfig.upsert({
    where: { key: PENTILI_BALANCE_KEY },
    update: {},
    create: { key: PENTILI_BALANCE_KEY, data: DEFAULT_PENTILI_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyPentiliBalance(prisma, await loadPentiliBalance(prisma));

  // Expeditions (owner decision, 2026-10-19): durations, rewards (by player
  // level), unlocks and the bonus chance come from the expeditions balance in
  // godmaster. The rows here only carry the name; the numbers are placeholders
  // that applyExpeditionBalance overwrites right away.
  for (const [key, nameKey] of [
    ['expedition_short', 'expeditions.short.name'],
    ['expedition_medium', 'expeditions.medium.name'],
    ['expedition_long', 'expeditions.long.name'],
  ]) {
    await prisma.expeditionType.upsert({
      where: { key },
      update: { nameKey },
      create: { key, nameKey, durationMinutes: 60, metalReward: 0, crystalReward: 0, creditsReward: 0, xpReward: 0 },
    });
  }
  await prisma.balanceConfig.upsert({
    where: { key: EXPEDITION_BALANCE_KEY },
    update: {},
    create: { key: EXPEDITION_BALANCE_KEY, data: DEFAULT_EXPEDITION_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyExpeditionBalance(prisma, await loadExpeditionBalance(prisma), await loadPentiliBalance(prisma));

  // Owner decision (2026-10-11): player level cap raised to 100 (from a
  // curve that previously only went to 14) — there's no separate "max level"
  // flag anywhere in the code, applyXp() simply stops once no LevelThreshold
  // row exists for the current level, so capping at 100 is just "don't seed
  // a level 100 row" (the level-99 row is the last one that matters, since
  // it's the cost to advance 99->100). Levels 1-14 are left exactly as they
  // were — real players already have levels/XP under that curve, and this
  // was live production. Levels 15-99 are new: a provisional placeholder
  // power-law curve (xpRequired = a * level^2.126, fit to pass through the
  // existing level 14 value so there's no visible seam), not a hand-picked
  // list — chosen over continuing the old curve's compounding-percentage
  // growth because that blows up catastrophically over 100 levels (an
  // earlier attempt put level 100 at 253 million XP for that level alone).
  // True pacing against a real season length still depends on Pentili/boss
  // XP rewards (not tuned yet) — this is a first pass, same as every other
  // placeholder value in instructions/OPEN_DECISIONS.md.
  // Since 2026-10-19 the curve is edited in godmaster → Balance → XP
  // (src/config/xp-balance.ts holds the defaults). Save the defaults once if
  // nothing is saved yet, then write the thresholds — never overwriting what
  // godmaster saved.
  await prisma.balanceConfig.upsert({
    where: { key: XP_BALANCE_KEY },
    update: {},
    create: { key: XP_BALANCE_KEY, data: DEFAULT_XP_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyXpBalance(prisma, await loadXpBalance(prisma));

  // Branches, technology list, costs and effects are UNDEFINED
  // (instructions/OPEN_DECISIONS.md: "Research"). Base balance (2026-10-14):
  // production +2%/level and combat +1%/level, since they now go to level 30.
  const researchTypes = await Promise.all(
    [
      { key: 'research_metal_production', nameKey: 'research.metal_production.name', descriptionKey: 'research.metal_production.description', bonusType: 'METAL_PRODUCTION' as const, bonusPerLevel: 0.02, maxLevel: 5, iconAssetId: 'research.metal_production.icon' },
      { key: 'research_crystal_production', nameKey: 'research.crystal_production.name', descriptionKey: 'research.crystal_production.description', bonusType: 'CRYSTAL_PRODUCTION' as const, bonusPerLevel: 0.02, maxLevel: 5, iconAssetId: 'research.crystal_production.icon' },
      { key: 'research_weapon_systems', nameKey: 'research.weapon_systems.name', descriptionKey: 'research.weapon_systems.description', bonusType: 'COMBAT_ATTACK' as const, bonusPerLevel: 0.01, maxLevel: 5, iconAssetId: 'research.weapon_systems.icon' },
      { key: 'research_hull_engineering', nameKey: 'research.hull_engineering.name', descriptionKey: 'research.hull_engineering.description', bonusType: 'COMBAT_HP' as const, bonusPerLevel: 0.01, maxLevel: 5, iconAssetId: 'research.hull_engineering.icon' },
      // New researches (owner decision, 2026-10-14) — placeholder rates.
      { key: 'research_construction', nameKey: 'research.construction.name', descriptionKey: 'research.construction.description', bonusType: 'CONSTRUCTION_SPEED' as const, bonusPerLevel: 0.01, maxLevel: 30, iconAssetId: 'research.construction.icon' },
      { key: 'research_methods', nameKey: 'research.methods.name', descriptionKey: 'research.methods.description', bonusType: 'RESEARCH_SPEED' as const, bonusPerLevel: 0.01, maxLevel: 30, iconAssetId: 'research.methods.icon' },
      { key: 'research_navigation', nameKey: 'research.navigation.name', descriptionKey: 'research.navigation.description', bonusType: 'EXPEDITION_REWARDS' as const, bonusPerLevel: 0.02, maxLevel: 30, iconAssetId: 'research.navigation.icon' },
      { key: 'research_metallurgy', nameKey: 'research.metallurgy.name', descriptionKey: 'research.metallurgy.description', bonusType: 'UPGRADE_MATERIALS' as const, bonusPerLevel: 0.01, maxLevel: 30, iconAssetId: 'research.metallurgy.icon' },
      { key: 'research_recycling', nameKey: 'research.recycling.name', descriptionKey: 'research.recycling.description', bonusType: 'RECYCLING' as const, bonusPerLevel: 0.02, maxLevel: 30, iconAssetId: 'research.recycling.icon' },
    ]
      // Every research goes up to level 30 (owner decision, 2026-10-14); update
      // existing rows too, so the cap follows this list.
      .map((data) => ({ ...data, maxLevel: 30 }))
      // Bonus and max level are balanced in godmaster since 2026-10-19 — existing rows only get their texts/icon here.
      .map((data) =>
        prisma.researchType.upsert({
          where: { key: data.key },
          update: { nameKey: data.nameKey, descriptionKey: data.descriptionKey, bonusType: data.bonusType, iconAssetId: data.iconAssetId },
          create: data,
        }),
      ),
  );

  // Buildings and research balance (owner decision, 2026-10-19): save the
  // defaults once if nothing is saved yet, then generate the level rows and
  // effects — never overwriting what godmaster saved.
  await prisma.balanceConfig.upsert({
    where: { key: BUILDING_BALANCE_KEY },
    update: {},
    create: { key: BUILDING_BALANCE_KEY, data: DEFAULT_BUILDING_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyBuildingBalance(prisma, await loadBuildingBalance(prisma));

  // Boss Formations (owner decision, 2026-09-11 — fully replaces the old
  // open-lobby Boss Hunts model). One boss per Territory/zone, scaled by zone
  // difficulty; stats for the 2 new bosses (Verdant Flats, Crimson Wastes)
  // are placeholders derived proportionally from the existing 2 bosses'
  // ratio to their own zone's strongest Pentili — retune once real balance
  // data exists. guaranteedBoxItemDefinitionId is tier-matched to the boss's
  // own zone tier (pioneer/ascendant/coreforged) — every winning formation
  // participant gets exactly 1, on top of the independent BossLootDrop rolls
  // below (unchanged mechanic, still independent per participant).
  // minLevel: owner decision (2026-10-11, revised same day) — per-boss
  // 15/25/45/65. The first boss is a fixed 15 (not its zone's own unlock
  // level of 1, which would be too early); each later boss is its own
  // zone's unlockLevel + 5, so the player has had a little room to gear up
  // in the new zone before the boss becomes available. Replaces the old
  // flat GAME_BALANCE.bossFormations.minLevel that gated all 4 bosses at
  // the same player level regardless of difficulty.
  //
  // maxHp/attack/defense/xpReward: owner decision (2026-10-11) — rescaled
  // against the new 1-100 level range and the formation combat model
  // (combat.service.ts's aggregateFormationCombatStats sums every filled
  // slot's raw attack/defense/hp before the fight, so a 5-player formation
  // fights as one combined combatant with roughly 5x a solo player's
  // stats). The previous values were untouched leftovers from the old,
  // much-narrower level range and had fallen badly out of step — e.g. the
  // first boss's attack/defense were weaker than several same-zone Pentili.
  // Derived from `damage = attacker.attack - 0.5 * defender.defense`
  // (combat.service.ts's resolveHit) against an estimated player power
  // curve (GAME_BALANCE.robotAttributes points + that zone's gear tier at a
  // modest, not-fully-upgraded level): a full 5-player formation wins in
  // ~8 rounds keeping 40-60% of its HP, a 4-player formation is a close
  // fight either way, and 3 or fewer players reliably lose — matching the
  // existing "implicit weakening, no explicit formula" design (see the
  // Boss Formations entry above). xpReward is split evenly across filled
  // slots (`Math.floor(xpReward / filledSlotCount)`) and sized so each
  // participant's share is roughly a dozen same-level Pentili kills' worth,
  // reflecting the once-per-24h cooldown and multi-player coordination
  // cost. First pass, not a final balance decision.
  const bossData = [
    { key: 'boss_verdant_warden', nameKey: 'bosses.verdant_warden.name', zoneId: zoneVerdant.id, level: 3, minLevel: 15, maxHp: 1400, attack: 130, defense: 60, xpReward: 16000, iconAssetId: 'bosses.verdant_warden.icon', guaranteedBoxItemDefinitionId: itemsByKey.pioneer_box.id },
    { key: 'boss_ridgeback_alpha', nameKey: 'bosses.ridgeback_alpha.name', zoneId: zoneAshen.id, level: 6, minLevel: 25, maxHp: 2500, attack: 210, defense: 180, xpReward: 32000, iconAssetId: 'bosses.ridgeback_alpha.icon', guaranteedBoxItemDefinitionId: itemsByKey.ascendant_box.id },
    { key: 'boss_crimson_harbinger', nameKey: 'bosses.crimson_harbinger.name', zoneId: zoneCrimson.id, level: 9, minLevel: 45, maxHp: 4700, attack: 380, defense: 350, xpReward: 68000, iconAssetId: 'bosses.crimson_harbinger.icon', guaranteedBoxItemDefinitionId: itemsByKey.coreforged_box.id },
    // No distinct top-tier reward designed yet for the final boss — reuses coreforged_box for now (owner decision, deferred).
    { key: 'boss_frost_sovereign', nameKey: 'bosses.frost_sovereign.name', zoneId: zoneFrostbound.id, level: 12, minLevel: 65, maxHp: 6100, attack: 490, defense: 440, xpReward: 110000, iconAssetId: 'bosses.frost_sovereign.icon', guaranteedBoxItemDefinitionId: itemsByKey.coreforged_box.id },
  ];
  const bossesByKey: Record<string, Awaited<ReturnType<typeof prisma.boss.upsert>>> = {};
  for (const data of bossData) {
    // Stats, XP, minimum level and box come from the bosses balance in
    // godmaster since 2026-10-19 — existing rows only get their texts here.
    bossesByKey[data.key] = await prisma.boss.upsert({
      where: { key: data.key },
      update: { nameKey: data.nameKey, zoneId: data.zoneId, level: data.level, iconAssetId: data.iconAssetId },
      create: data,
    });
  }
  // Boss loot from the balance (owner decision, 2026-10-19 — the old rows were
  // examples): save the defaults once if nothing is saved yet, then apply.
  await prisma.balanceConfig.upsert({
    where: { key: BOSS_BALANCE_KEY },
    update: {},
    create: { key: BOSS_BALANCE_KEY, data: DEFAULT_BOSS_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyBossBalance(prisma, await loadBossBalance(prisma), await loadPentiliBalance(prisma));

  // Clan buildings (instructions/GAME_SYSTEMS.md, LOCKED: "Clans are
  // central"): "clan building list" is UNDEFINED — 3 buildings as a working
  // M4 foundation, funded entirely from the clan treasury. Member Hall's
  // bonusPerLevel is a flat extra-slot count, not a percentage. Owner-specified:
  // all 3 buildings develop up to level 10; Member Hall grants +2 slots/level
  // (was +5/level up to level 5).
  await Promise.all(
    [
      { key: 'member_hall', nameKey: 'clanBuildings.member_hall.name', descriptionKey: 'clanBuildings.member_hall.description', bonusType: 'MEMBER_CAPACITY' as const, bonusPerLevel: 2, maxLevel: 10, iconAssetId: 'clanBuildings.member_hall.icon' },
      // Forge and Refinery (shown as "Refinery", key kept as clan_depot): +1%/level
      // up to 30 since the base balance (2026-10-14) — they were +5% up to 10,
      // more than the personal researches.
      { key: 'clan_forge', nameKey: 'clanBuildings.clan_forge.name', descriptionKey: 'clanBuildings.clan_forge.description', bonusType: 'COMBAT_BONUS' as const, bonusPerLevel: 0.01, maxLevel: 30, iconAssetId: 'clanBuildings.clan_forge.icon' },
      { key: 'clan_depot', nameKey: 'clanBuildings.clan_depot.name', descriptionKey: 'clanBuildings.clan_depot.description', bonusType: 'PRODUCTION_BONUS' as const, bonusPerLevel: 0.01, maxLevel: 30, iconAssetId: 'clanBuildings.clan_depot.icon' },
      // Generator (owner decision, 2026-10-14): half the personal Reactor.
      { key: 'clan_generator', nameKey: 'clanBuildings.clan_generator.name', descriptionKey: 'clanBuildings.clan_generator.description', bonusType: 'ENERGY_REGEN' as const, bonusPerLevel: 0.005, maxLevel: 30, iconAssetId: 'clanBuildings.clan_generator.icon' },
    // Bonus and max level are balanced in godmaster since 2026-10-19 — existing
    // rows only get their texts/icon here (the values above are for a new database).
    ].map((data) =>
      prisma.clanBuildingType.upsert({
        where: { key: data.key },
        update: { nameKey: data.nameKey, descriptionKey: data.descriptionKey, bonusType: data.bonusType, iconAssetId: data.iconAssetId },
        create: data,
      }),
    ),
  );

  // Tavern (owner decision, 2026-10-12): +1% damage per level vs bosses and
  // the Core, only while activated. Capped at level 30 since 2026-10-19; its
  // levels, costs and activation come from the clan balance below.
  const tavernData = {
    key: 'clan_tavern',
    nameKey: 'clanBuildings.clan_tavern.name',
    descriptionKey: 'clanBuildings.clan_tavern.description',
    bonusType: 'BOSS_CORE_DAMAGE' as const,
    bonusPerLevel: 0.01,
    maxLevel: 1,
    iconAssetId: 'clanBuildings.clan_tavern.icon',
  };
  await prisma.clanBuildingType.upsert({
    where: { key: tavernData.key },
    update: { nameKey: tavernData.nameKey, descriptionKey: tavernData.descriptionKey, iconAssetId: tavernData.iconAssetId },
    create: tavernData,
  });

  // Clan building costs, bonuses and the Cantina's rows come from the clan
  // balance in godmaster (src/config/clan-balance.ts, 2026-10-19): save the
  // defaults once if nothing is saved yet, then generate.
  await prisma.balanceConfig.upsert({
    where: { key: CLAN_BALANCE_KEY },
    update: {},
    create: { key: CLAN_BALANCE_KEY, data: DEFAULT_CLAN_BALANCE as unknown as Prisma.InputJsonValue },
  });
  await applyClanBalance(prisma, await loadClanBalance(prisma));

  // Content filter starter list (owner decision, 2026-10-12). Only words
  // not listed yet are added — never removes or overrides what moderators
  // added or changed in godmaster. `normalized` must match
  // src/moderation/content-filter.ts's normalizeWord(); it's duplicated here
  // (not imported) because the production image ships no src/ for the seed.
  const starterWords: [string, 'WHOLE_WORD' | 'SUBSTRING'][] = [
    ['ass', 'WHOLE_WORD'],
    ['cunt', 'WHOLE_WORD'],
    ['dick', 'WHOLE_WORD'],
    ['cock', 'WHOLE_WORD'],
    ['sex', 'WHOLE_WORD'],
    ['rape', 'WHOLE_WORD'],
    ['fag', 'WHOLE_WORD'],
    ['tits', 'WHOLE_WORD'],
    ['еба', 'WHOLE_WORD'],
    ['ебал', 'WHOLE_WORD'],
    ['ебах', 'WHOLE_WORD'],
    ['ебем', 'WHOLE_WORD'],
    ['ебеш', 'WHOLE_WORD'],
    ['хуй', 'WHOLE_WORD'],
    ['хуя', 'WHOLE_WORD'],
    ['кур', 'WHOLE_WORD'],
    ['деба', 'WHOLE_WORD'],
    ['fuck', 'SUBSTRING'],
    ['motherfucker', 'SUBSTRING'],
    ['shit', 'SUBSTRING'],
    ['bitch', 'SUBSTRING'],
    ['asshole', 'SUBSTRING'],
    ['bastard', 'SUBSTRING'],
    ['pussy', 'SUBSTRING'],
    ['whore', 'SUBSTRING'],
    ['slut', 'SUBSTRING'],
    ['nigger', 'SUBSTRING'],
    ['nigga', 'SUBSTRING'],
    ['faggot', 'SUBSTRING'],
    ['retard', 'SUBSTRING'],
    ['hitler', 'SUBSTRING'],
    ['porn', 'SUBSTRING'],
    ['penis', 'SUBSTRING'],
    ['vagina', 'SUBSTRING'],
    ['dildo', 'SUBSTRING'],
    ['wanker', 'SUBSTRING'],
    ['twat', 'SUBSTRING'],
    ['путка', 'SUBSTRING'],
    ['путьо', 'SUBSTRING'],
    ['пичка', 'SUBSTRING'],
    ['курва', 'SUBSTRING'],
    ['курец', 'SUBSTRING'],
    ['шибан', 'SUBSTRING'],
    ['шибаняк', 'SUBSTRING'],
    ['ебан', 'WHOLE_WORD'],
    ['ебана', 'WHOLE_WORD'],
    ['ебало', 'SUBSTRING'],
    ['ебачка', 'SUBSTRING'],
    ['мамкамуи', 'SUBSTRING'],
    ['мамкатии', 'SUBSTRING'],
    ['лайно', 'SUBSTRING'],
    ['копеле', 'SUBSTRING'],
    ['педераст', 'SUBSTRING'],
    ['проститутка', 'SUBSTRING'],
    ['дебил', 'SUBSTRING'],
    ['идиот', 'SUBSTRING'],
  ];
  const BG_TRANSLIT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
  };
  const normalizeWord = (w: string) =>
    [...w.toLowerCase()]
      .map((ch) => BG_TRANSLIT[ch] ?? ch)
      .join('')
      .replace(/[^a-z]/g, '')
      .replace(/(.)\1+/g, '$1');
  for (const [word, match] of starterWords) {
    const normalized = normalizeWord(word);
    await prisma.bannedWord.upsert({ where: { normalized }, update: {}, create: { word, normalized, match, createdBy: 'seed' } });
  }

  // Season 1 (owner decision, 2026-10-12): created unscheduled — the Core's
  // opening time is set later from the godmaster Settings tab. Only created if
  // no season exists yet, never touches a live one.
  if ((await prisma.season.count()) === 0) {
    await prisma.season.create({ data: {} });
  }

  // Selectable profile-picture cosmetics (owner decision, 2026-09-09) — all 6
  // of each are free to pick for now; some may require unlocking later, not
  // built yet. See apps/web/public/assets/avatars/ and .../frames/.
  await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) => {
      const data = { key: `avatar${n}`, nameKey: `avatars.avatar${n}.name`, iconAssetId: `avatars.avatar${n}.icon` };
      return prisma.avatarDefinition.upsert({ where: { key: data.key }, update: data, create: data });
    }),
  );
  await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) => {
      const data = { key: `frame${n}`, nameKey: `frames.frame${n}.name`, iconAssetId: `frames.frame${n}.icon` };
      return prisma.frameDefinition.upsert({ where: { key: data.key }, update: data, create: data });
    }),
  );

  // Real-money products (owner decision, 2026-10-15). Managed in godmaster
  // since 2026-10-17: the seed only creates the first rows and never
  // overwrites them (update: {}). A product is offered once godmaster gives it
  // a Stripe price.
  const paymentProducts = [
    { key: 'credits_500', kind: 'CREDITS' as const, credits: 500, vipDays: null, priceCents: 500, sortOrder: 1 },
    { key: 'vip_month', kind: 'VIP' as const, credits: null, vipDays: 30, priceCents: 499, sortOrder: 10 },
  ];
  for (const data of paymentProducts) {
    await prisma.paymentProduct.upsert({ where: { key: data.key }, update: {}, create: data });
  }

  console.log('Seeded Milestone 1-2 static content.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
