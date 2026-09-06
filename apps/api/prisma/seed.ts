import { PrismaClient } from '@prisma/client';

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
  const [zoneVerdant, zoneAshen, zoneCrimson, zoneFrostbound] = await Promise.all([
    prisma.zone.upsert({
      where: { key: 'zone_verdant_flats' },
      update: {},
      create: { key: 'zone_verdant_flats', nameKey: 'zones.verdant_flats.name', order: 1, unlockLevel: 1 },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_ashen_ridge' },
      update: {},
      create: { key: 'zone_ashen_ridge', nameKey: 'zones.ashen_ridge.name', order: 2, unlockLevel: 3 },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_crimson_wastes' },
      update: {},
      create: { key: 'zone_crimson_wastes', nameKey: 'zones.crimson_wastes.name', order: 3, unlockLevel: 6 },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_frostbound_reach' },
      update: {},
      create: { key: 'zone_frostbound_reach', nameKey: 'zones.frostbound_reach.name', order: 4, unlockLevel: 9 },
    }),
  ]);

  const pentiliData = [
    { key: 'pentili_skitterling', nameKey: 'pentili.skitterling.name', zoneId: zoneVerdant.id, level: 1, maxHp: 20, attack: 4, defense: 1, xpReward: 10, iconAssetId: 'pentili.skitterling.icon' },
    { key: 'pentili_mossback', nameKey: 'pentili.mossback.name', zoneId: zoneVerdant.id, level: 2, maxHp: 35, attack: 6, defense: 3, xpReward: 18, iconAssetId: 'pentili.mossback.icon' },
    { key: 'pentili_ridgefang', nameKey: 'pentili.ridgefang.name', zoneId: zoneAshen.id, level: 4, maxHp: 70, attack: 12, defense: 6, xpReward: 40, iconAssetId: 'pentili.ridgefang.icon' },
    { key: 'pentili_cinderclaw', nameKey: 'pentili.cinderclaw.name', zoneId: zoneAshen.id, level: 5, maxHp: 90, attack: 15, defense: 8, xpReward: 55, iconAssetId: 'pentili.cinderclaw.icon' },
    { key: 'pentili_duskfang', nameKey: 'pentili.duskfang.name', zoneId: zoneCrimson.id, level: 7, maxHp: 140, attack: 22, defense: 12, xpReward: 90, iconAssetId: 'pentili.duskfang.icon' },
    { key: 'pentili_voidling', nameKey: 'pentili.voidling.name', zoneId: zoneCrimson.id, level: 8, maxHp: 170, attack: 26, defense: 14, xpReward: 110, iconAssetId: 'pentili.voidling.icon' },
    { key: 'pentili_glacialwraith', nameKey: 'pentili.glacialwraith.name', zoneId: zoneFrostbound.id, level: 10, maxHp: 230, attack: 32, defense: 18, xpReward: 150, iconAssetId: 'pentili.glacialwraith.icon' },
    { key: 'pentili_stormcaller', nameKey: 'pentili.stormcaller.name', zoneId: zoneFrostbound.id, level: 11, maxHp: 260, attack: 36, defense: 20, xpReward: 175, iconAssetId: 'pentili.stormcaller.icon' },
  ];
  const pentiliByKey: Record<string, Awaited<ReturnType<typeof prisma.pentili.upsert>>> = {};
  for (const data of pentiliData) {
    pentiliByKey[data.key] = await prisma.pentili.upsert({ where: { key: data.key }, update: {}, create: data });
  }
  const { pentili_skitterling: skitterling, pentili_mossback: mossback, pentili_ridgefang: ridgefang,
    pentili_cinderclaw: cinderclaw, pentili_duskfang: duskfang, pentili_voidling: voidling,
    pentili_glacialwraith: glacialwraith, pentili_stormcaller: stormcaller } = pentiliByKey;

  const buildingTypes = await Promise.all(
    [
      { key: 'metal_mine', nameKey: 'buildings.metal_mine.name', maxLevel: 10, iconAssetId: 'buildings.metal_mine.icon' },
      {
        key: 'crystal_extractor',
        nameKey: 'buildings.crystal_extractor.name',
        maxLevel: 10,
        iconAssetId: 'buildings.crystal_extractor.icon',
      },
      { key: 'warehouse', nameKey: 'buildings.warehouse.name', maxLevel: 10, iconAssetId: 'buildings.warehouse.icon' },
    ].map((data) => prisma.buildingType.upsert({ where: { key: data.key }, update: {}, create: data })),
  );
  const [metalMine, crystalExtractor, warehouse] = buildingTypes;

  const levelCosts = [
    { buildingTypeId: metalMine.id, level: 1, metalCost: 0, crystalCost: 50, constructionSeconds: 60, producesResourceType: 'METAL' as const, producesPerHour: 100 },
    { buildingTypeId: metalMine.id, level: 2, metalCost: 0, crystalCost: 120, constructionSeconds: 180, producesResourceType: 'METAL' as const, producesPerHour: 220 },
    { buildingTypeId: metalMine.id, level: 3, metalCost: 0, crystalCost: 250, constructionSeconds: 420, producesResourceType: 'METAL' as const, producesPerHour: 400 },
    { buildingTypeId: crystalExtractor.id, level: 1, metalCost: 80, crystalCost: 0, constructionSeconds: 90, producesResourceType: 'CRYSTAL' as const, producesPerHour: 60 },
    { buildingTypeId: crystalExtractor.id, level: 2, metalCost: 180, crystalCost: 0, constructionSeconds: 240, producesResourceType: 'CRYSTAL' as const, producesPerHour: 130 },
    { buildingTypeId: crystalExtractor.id, level: 3, metalCost: 350, crystalCost: 0, constructionSeconds: 480, producesResourceType: 'CRYSTAL' as const, producesPerHour: 240 },
    { buildingTypeId: warehouse.id, level: 1, metalCost: 60, crystalCost: 20, constructionSeconds: 60 },
    { buildingTypeId: warehouse.id, level: 2, metalCost: 150, crystalCost: 60, constructionSeconds: 200 },
    { buildingTypeId: warehouse.id, level: 3, metalCost: 300, crystalCost: 120, constructionSeconds: 400 },
  ];
  for (const cost of levelCosts) {
    await prisma.buildingLevelCost.upsert({
      where: { buildingTypeId_level: { buildingTypeId: cost.buildingTypeId, level: cost.level } },
      update: {},
      create: cost,
    });
  }

  const itemData = [
    { key: 'weapon_starter_blaster', nameKey: 'items.weapon_starter_blaster.name', descriptionKey: 'items.weapon_starter_blaster.description', slot: 'WEAPON' as const, baseStats: { attack: 5 }, maxUpgradeLevel: 5, iconAssetId: 'items.weapon_starter_blaster.icon', isStarterItem: true },
    { key: 'engine_starter_thruster', nameKey: 'items.engine_starter_thruster.name', descriptionKey: 'items.engine_starter_thruster.description', slot: 'ENGINE' as const, baseStats: { hp: 5 }, maxUpgradeLevel: 5, iconAssetId: 'items.engine_starter_thruster.icon', isStarterItem: true },
    { key: 'hull_starter_plating', nameKey: 'items.hull_starter_plating.name', descriptionKey: 'items.hull_starter_plating.description', slot: 'HULL' as const, baseStats: { hp: 15, defense: 2 }, maxUpgradeLevel: 5, iconAssetId: 'items.hull_starter_plating.icon', isStarterItem: true },
    { key: 'shield_starter_barrier', nameKey: 'items.shield_starter_barrier.name', descriptionKey: 'items.shield_starter_barrier.description', slot: 'SHIELD' as const, baseStats: { defense: 5 }, maxUpgradeLevel: 5, iconAssetId: 'items.shield_starter_barrier.icon', isStarterItem: true },
    { key: 'reactor_starter_core', nameKey: 'items.reactor_starter_core.name', descriptionKey: 'items.reactor_starter_core.description', slot: 'REACTOR' as const, baseStats: { attack: 2, defense: 2 }, maxUpgradeLevel: 5, iconAssetId: 'items.reactor_starter_core.icon', isStarterItem: true },
    { key: 'utility_starter_scanner', nameKey: 'items.utility_starter_scanner.name', descriptionKey: 'items.utility_starter_scanner.description', slot: 'UTILITY' as const, baseStats: { attack: 1 }, maxUpgradeLevel: 5, iconAssetId: 'items.utility_starter_scanner.icon', isStarterItem: true },
    { key: 'weapon_pulse_cannon', nameKey: 'items.weapon_pulse_cannon.name', descriptionKey: 'items.weapon_pulse_cannon.description', slot: 'WEAPON' as const, baseStats: { attack: 12 }, maxUpgradeLevel: 8, iconAssetId: 'items.weapon_pulse_cannon.icon', isStarterItem: false },
    { key: 'hull_reinforced_plating', nameKey: 'items.hull_reinforced_plating.name', descriptionKey: 'items.hull_reinforced_plating.description', slot: 'HULL' as const, baseStats: { hp: 30, defense: 5 }, maxUpgradeLevel: 8, iconAssetId: 'items.hull_reinforced_plating.icon', isStarterItem: false },
    { key: 'engine_ion_drive', nameKey: 'items.engine_ion_drive.name', descriptionKey: 'items.engine_ion_drive.description', slot: 'ENGINE' as const, baseStats: { hp: 20 }, maxUpgradeLevel: 8, iconAssetId: 'items.engine_ion_drive.icon', isStarterItem: false },
    { key: 'shield_aegis_barrier', nameKey: 'items.shield_aegis_barrier.name', descriptionKey: 'items.shield_aegis_barrier.description', slot: 'SHIELD' as const, baseStats: { defense: 10 }, maxUpgradeLevel: 8, iconAssetId: 'items.shield_aegis_barrier.icon', isStarterItem: false },
    { key: 'reactor_fusion_core', nameKey: 'items.reactor_fusion_core.name', descriptionKey: 'items.reactor_fusion_core.description', slot: 'REACTOR' as const, baseStats: { attack: 6, defense: 4 }, maxUpgradeLevel: 8, iconAssetId: 'items.reactor_fusion_core.icon', isStarterItem: false },
    { key: 'utility_deep_scanner', nameKey: 'items.utility_deep_scanner.name', descriptionKey: 'items.utility_deep_scanner.description', slot: 'UTILITY' as const, baseStats: { attack: 4 }, maxUpgradeLevel: 8, iconAssetId: 'items.utility_deep_scanner.icon', isStarterItem: false },
    { key: 'weapon_railgun', nameKey: 'items.weapon_railgun.name', descriptionKey: 'items.weapon_railgun.description', slot: 'WEAPON' as const, baseStats: { attack: 20 }, maxUpgradeLevel: 10, iconAssetId: 'items.weapon_railgun.icon', isStarterItem: false },
    { key: 'hull_titan_plating', nameKey: 'items.hull_titan_plating.name', descriptionKey: 'items.hull_titan_plating.description', slot: 'HULL' as const, baseStats: { hp: 60, defense: 10 }, maxUpgradeLevel: 10, iconAssetId: 'items.hull_titan_plating.icon', isStarterItem: false },
  ];
  const itemsByKey: Record<string, Awaited<ReturnType<typeof prisma.itemDefinition.upsert>>> = {};
  for (const data of itemData) {
    itemsByKey[data.key] = await prisma.itemDefinition.upsert({ where: { key: data.key }, update: {}, create: data });
  }

  const allPentiliIds = Object.values(pentiliByKey).map((p) => p.id);
  await prisma.lootDrop.deleteMany({ where: { pentiliId: { in: allPentiliIds } } });
  await prisma.lootDrop.createMany({
    data: [
      { pentiliId: skitterling.id, resourceType: 'METAL', dropChance: 0.8, minQuantity: 5, maxQuantity: 15 },
      { pentiliId: skitterling.id, resourceType: 'UPGRADE_STONES', dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: mossback.id, resourceType: 'CRYSTAL', dropChance: 0.5, minQuantity: 3, maxQuantity: 8 },
      { pentiliId: mossback.id, itemDefinitionId: itemsByKey.weapon_pulse_cannon.id, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: ridgefang.id, resourceType: 'CREDITS', dropChance: 0.6, minQuantity: 10, maxQuantity: 20 },
      { pentiliId: ridgefang.id, resourceType: 'UPGRADE_STONES', dropChance: 0.15, minQuantity: 1, maxQuantity: 2 },
      { pentiliId: ridgefang.id, itemDefinitionId: itemsByKey.hull_reinforced_plating.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: cinderclaw.id, resourceType: 'METAL', dropChance: 0.6, minQuantity: 15, maxQuantity: 30 },
      { pentiliId: cinderclaw.id, resourceType: 'UPGRADE_STONES', dropChance: 0.15, minQuantity: 1, maxQuantity: 2 },
      { pentiliId: cinderclaw.id, itemDefinitionId: itemsByKey.shield_aegis_barrier.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: duskfang.id, resourceType: 'CRYSTAL', dropChance: 0.55, minQuantity: 15, maxQuantity: 30 },
      { pentiliId: duskfang.id, resourceType: 'CREDITS', dropChance: 0.4, minQuantity: 20, maxQuantity: 40 },
      { pentiliId: duskfang.id, itemDefinitionId: itemsByKey.reactor_fusion_core.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: voidling.id, resourceType: 'CREDITS', dropChance: 0.5, minQuantity: 30, maxQuantity: 60 },
      { pentiliId: voidling.id, resourceType: 'UPGRADE_STONES', dropChance: 0.2, minQuantity: 2, maxQuantity: 3 },
      { pentiliId: voidling.id, itemDefinitionId: itemsByKey.weapon_railgun.id, dropChance: 0.07, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: glacialwraith.id, resourceType: 'METAL', dropChance: 0.6, minQuantity: 40, maxQuantity: 70 },
      { pentiliId: glacialwraith.id, resourceType: 'CRYSTAL', dropChance: 0.5, minQuantity: 30, maxQuantity: 50 },
      { pentiliId: glacialwraith.id, itemDefinitionId: itemsByKey.hull_titan_plating.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: stormcaller.id, resourceType: 'CREDITS', dropChance: 0.5, minQuantity: 50, maxQuantity: 90 },
      { pentiliId: stormcaller.id, resourceType: 'UPGRADE_STONES', dropChance: 0.25, minQuantity: 2, maxQuantity: 4 },
      { pentiliId: stormcaller.id, itemDefinitionId: itemsByKey.utility_deep_scanner.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
    ],
  });

  // Durations (1h/5h/10h) are GAME_SYSTEMS.md's own example; rewards taper
  // per-hour as duration grows (short = efficient, long = bigger total,
  // better for offline play) — see instructions/OPEN_DECISIONS.md.
  const expeditionTypes = [
    { key: 'expedition_short', nameKey: 'expeditions.short.name', durationMinutes: 60, metalReward: 60, crystalReward: 20, creditsReward: 10, xpReward: 15, bonusItemDefinitionId: itemsByKey.engine_ion_drive.id, bonusItemChance: 0.03 },
    { key: 'expedition_medium', nameKey: 'expeditions.medium.name', durationMinutes: 300, metalReward: 250, crystalReward: 90, creditsReward: 50, xpReward: 70, bonusItemDefinitionId: itemsByKey.shield_aegis_barrier.id, bonusItemChance: 0.06 },
    { key: 'expedition_long', nameKey: 'expeditions.long.name', durationMinutes: 600, metalReward: 450, crystalReward: 160, creditsReward: 100, xpReward: 130, bonusItemDefinitionId: itemsByKey.reactor_fusion_core.id, bonusItemChance: 0.1 },
  ];
  for (const data of expeditionTypes) {
    await prisma.expeditionType.upsert({ where: { key: data.key }, update: {}, create: data });
  }

  const levelThresholds = [
    { level: 1, xpRequired: 30 },
    { level: 2, xpRequired: 60 },
    { level: 3, xpRequired: 120 },
    { level: 4, xpRequired: 220 },
    { level: 5, xpRequired: 400 },
    { level: 6, xpRequired: 650 },
    { level: 7, xpRequired: 1000 },
    { level: 8, xpRequired: 1500 },
    { level: 9, xpRequired: 2200 },
    { level: 10, xpRequired: 3000 },
    { level: 11, xpRequired: 4000 },
    { level: 12, xpRequired: 5200 },
    { level: 13, xpRequired: 6600 },
    { level: 14, xpRequired: 8200 },
  ];
  for (const threshold of levelThresholds) {
    await prisma.levelThreshold.upsert({ where: { level: threshold.level }, update: {}, create: threshold });
  }

  // Branches, technology list, costs and effects are UNDEFINED
  // (instructions/OPEN_DECISIONS.md: "Research"). +5%/level is a placeholder
  // rate, not a decided balance value.
  const researchTypes = await Promise.all(
    [
      { key: 'research_metal_production', nameKey: 'research.metal_production.name', descriptionKey: 'research.metal_production.description', bonusType: 'METAL_PRODUCTION' as const, bonusPerLevel: 0.05, maxLevel: 5, iconAssetId: 'research.metal_production.icon' },
      { key: 'research_crystal_production', nameKey: 'research.crystal_production.name', descriptionKey: 'research.crystal_production.description', bonusType: 'CRYSTAL_PRODUCTION' as const, bonusPerLevel: 0.05, maxLevel: 5, iconAssetId: 'research.crystal_production.icon' },
      { key: 'research_weapon_systems', nameKey: 'research.weapon_systems.name', descriptionKey: 'research.weapon_systems.description', bonusType: 'COMBAT_ATTACK' as const, bonusPerLevel: 0.05, maxLevel: 5, iconAssetId: 'research.weapon_systems.icon' },
      { key: 'research_hull_engineering', nameKey: 'research.hull_engineering.name', descriptionKey: 'research.hull_engineering.description', bonusType: 'COMBAT_HP' as const, bonusPerLevel: 0.05, maxLevel: 5, iconAssetId: 'research.hull_engineering.icon' },
    ].map((data) => prisma.researchType.upsert({ where: { key: data.key }, update: {}, create: data })),
  );

  const researchLevelCosts = researchTypes.flatMap((researchType) => [
    { researchTypeId: researchType.id, level: 1, metalCost: 200, crystalCost: 80, creditsCost: 0, researchSeconds: 120 },
    { researchTypeId: researchType.id, level: 2, metalCost: 450, crystalCost: 180, creditsCost: 50, researchSeconds: 360 },
    { researchTypeId: researchType.id, level: 3, metalCost: 800, crystalCost: 320, creditsCost: 120, researchSeconds: 900 },
    { researchTypeId: researchType.id, level: 4, metalCost: 1300, crystalCost: 520, creditsCost: 220, researchSeconds: 1800 },
    { researchTypeId: researchType.id, level: 5, metalCost: 2000, crystalCost: 800, creditsCost: 350, researchSeconds: 3600 },
  ]);
  for (const cost of researchLevelCosts) {
    await prisma.researchLevelCost.upsert({
      where: { researchTypeId_level: { researchTypeId: cost.researchTypeId, level: cost.level } },
      update: {},
      create: cost,
    });
  }

  // Boss Hunts (instructions/GAME_SYSTEMS.md, LOCKED direction): group size,
  // attempts, loot and boss timers are UNDEFINED — 2 bosses with placeholder
  // stats/window as a working M2 foundation, not a final content list.
  const bossData = [
    { key: 'boss_ridgeback_alpha', nameKey: 'bosses.ridgeback_alpha.name', zoneId: zoneAshen.id, level: 6, maxHp: 1200, attack: 30, defense: 15, xpReward: 300, encounterWindowSeconds: 600, iconAssetId: 'bosses.ridgeback_alpha.icon' },
    { key: 'boss_frost_sovereign', nameKey: 'bosses.frost_sovereign.name', zoneId: zoneFrostbound.id, level: 12, maxHp: 3500, attack: 55, defense: 30, xpReward: 800, encounterWindowSeconds: 900, iconAssetId: 'bosses.frost_sovereign.icon' },
  ];
  const bossesByKey: Record<string, Awaited<ReturnType<typeof prisma.boss.upsert>>> = {};
  for (const data of bossData) {
    bossesByKey[data.key] = await prisma.boss.upsert({ where: { key: data.key }, update: {}, create: data });
  }
  const { boss_ridgeback_alpha: ridgebackAlpha, boss_frost_sovereign: frostSovereign } = bossesByKey;

  const allBossIds = Object.values(bossesByKey).map((b) => b.id);
  await prisma.bossLootDrop.deleteMany({ where: { bossId: { in: allBossIds } } });
  await prisma.bossLootDrop.createMany({
    data: [
      { bossId: ridgebackAlpha.id, resourceType: 'METAL', dropChance: 0.9, minQuantity: 50, maxQuantity: 100 },
      { bossId: ridgebackAlpha.id, resourceType: 'CRYSTAL', dropChance: 0.7, minQuantity: 20, maxQuantity: 40 },
      { bossId: ridgebackAlpha.id, itemDefinitionId: itemsByKey.weapon_railgun.id, dropChance: 0.15, minQuantity: 1, maxQuantity: 1 },

      { bossId: frostSovereign.id, resourceType: 'CREDITS', dropChance: 0.9, minQuantity: 100, maxQuantity: 200 },
      { bossId: frostSovereign.id, resourceType: 'UPGRADE_STONES', dropChance: 0.5, minQuantity: 3, maxQuantity: 6 },
      { bossId: frostSovereign.id, itemDefinitionId: itemsByKey.reactor_fusion_core.id, dropChance: 0.2, minQuantity: 1, maxQuantity: 1 },
      { bossId: frostSovereign.id, itemDefinitionId: itemsByKey.hull_titan_plating.id, dropChance: 0.15, minQuantity: 1, maxQuantity: 1 },
    ],
  });

  // Clan buildings (instructions/GAME_SYSTEMS.md, LOCKED: "Clans are
  // central"): "clan building list" is UNDEFINED — 3 buildings as a working
  // M4 foundation, funded entirely from the clan treasury. Member Hall's
  // bonusPerLevel is a flat extra-slot count, not a percentage.
  const clanBuildingTypes = await Promise.all(
    [
      { key: 'member_hall', nameKey: 'clanBuildings.member_hall.name', descriptionKey: 'clanBuildings.member_hall.description', bonusType: 'MEMBER_CAPACITY' as const, bonusPerLevel: 5, maxLevel: 5, iconAssetId: 'clanBuildings.member_hall.icon' },
      { key: 'clan_forge', nameKey: 'clanBuildings.clan_forge.name', descriptionKey: 'clanBuildings.clan_forge.description', bonusType: 'COMBAT_BONUS' as const, bonusPerLevel: 0.05, maxLevel: 5, iconAssetId: 'clanBuildings.clan_forge.icon' },
      { key: 'clan_depot', nameKey: 'clanBuildings.clan_depot.name', descriptionKey: 'clanBuildings.clan_depot.description', bonusType: 'PRODUCTION_BONUS' as const, bonusPerLevel: 0.05, maxLevel: 5, iconAssetId: 'clanBuildings.clan_depot.icon' },
    ].map((data) => prisma.clanBuildingType.upsert({ where: { key: data.key }, update: {}, create: data })),
  );

  const clanBuildingLevelCosts = clanBuildingTypes.flatMap((buildingType) => [
    { clanBuildingTypeId: buildingType.id, level: 1, metalCost: 500, crystalCost: 200, creditsCost: 100, constructionSeconds: 300 },
    { clanBuildingTypeId: buildingType.id, level: 2, metalCost: 1200, crystalCost: 500, creditsCost: 300, constructionSeconds: 900 },
    { clanBuildingTypeId: buildingType.id, level: 3, metalCost: 2500, crystalCost: 1000, creditsCost: 700, constructionSeconds: 1800 },
    { clanBuildingTypeId: buildingType.id, level: 4, metalCost: 4500, crystalCost: 1800, creditsCost: 1300, constructionSeconds: 3600 },
    { clanBuildingTypeId: buildingType.id, level: 5, metalCost: 7500, crystalCost: 3000, creditsCost: 2200, constructionSeconds: 7200 },
  ]);
  for (const cost of clanBuildingLevelCosts) {
    await prisma.clanBuildingLevelCost.upsert({
      where: { clanBuildingTypeId_level: { clanBuildingTypeId: cost.clanBuildingTypeId, level: cost.level } },
      update: {},
      create: cost,
    });
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
