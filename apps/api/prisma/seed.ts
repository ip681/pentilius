import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Milestone 1 static content. Numeric balance values here (costs, timers,
 * drop chances, XP thresholds, zone unlock levels) are placeholders standing
 * in for design decisions marked UNDEFINED in instructions/GAME_SYSTEMS.md
 * and instructions/OPEN_DECISIONS.md — see that file for the running list.
 * They exist only so Milestone 1 is a playable vertical slice; retune here,
 * not in code, once real values are decided.
 */
async function main() {
  const [zoneVerdant, zoneAshen] = await Promise.all([
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
  ]);

  const skitterling = await prisma.pentili.upsert({
    where: { key: 'pentili_skitterling' },
    update: {},
    create: {
      key: 'pentili_skitterling',
      nameKey: 'pentili.skitterling.name',
      zoneId: zoneVerdant.id,
      level: 1,
      maxHp: 20,
      attack: 4,
      defense: 1,
      xpReward: 10,
      iconAssetId: 'pentili.skitterling.icon',
    },
  });

  const mossback = await prisma.pentili.upsert({
    where: { key: 'pentili_mossback' },
    update: {},
    create: {
      key: 'pentili_mossback',
      nameKey: 'pentili.mossback.name',
      zoneId: zoneVerdant.id,
      level: 2,
      maxHp: 35,
      attack: 6,
      defense: 3,
      xpReward: 18,
      iconAssetId: 'pentili.mossback.icon',
    },
  });

  const ridgefang = await prisma.pentili.upsert({
    where: { key: 'pentili_ridgefang' },
    update: {},
    create: {
      key: 'pentili_ridgefang',
      nameKey: 'pentili.ridgefang.name',
      zoneId: zoneAshen.id,
      level: 4,
      maxHp: 70,
      attack: 12,
      defense: 6,
      xpReward: 40,
      iconAssetId: 'pentili.ridgefang.icon',
    },
  });

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

  const itemDefinitions = await Promise.all(
    [
      { key: 'weapon_starter_blaster', nameKey: 'items.weapon_starter_blaster.name', descriptionKey: 'items.weapon_starter_blaster.description', slot: 'WEAPON' as const, baseStats: { attack: 5 }, maxUpgradeLevel: 5, iconAssetId: 'items.weapon_starter_blaster.icon', isStarterItem: true },
      { key: 'engine_starter_thruster', nameKey: 'items.engine_starter_thruster.name', descriptionKey: 'items.engine_starter_thruster.description', slot: 'ENGINE' as const, baseStats: { hp: 5 }, maxUpgradeLevel: 5, iconAssetId: 'items.engine_starter_thruster.icon', isStarterItem: true },
      { key: 'hull_starter_plating', nameKey: 'items.hull_starter_plating.name', descriptionKey: 'items.hull_starter_plating.description', slot: 'HULL' as const, baseStats: { hp: 15, defense: 2 }, maxUpgradeLevel: 5, iconAssetId: 'items.hull_starter_plating.icon', isStarterItem: true },
      { key: 'shield_starter_barrier', nameKey: 'items.shield_starter_barrier.name', descriptionKey: 'items.shield_starter_barrier.description', slot: 'SHIELD' as const, baseStats: { defense: 5 }, maxUpgradeLevel: 5, iconAssetId: 'items.shield_starter_barrier.icon', isStarterItem: true },
      { key: 'reactor_starter_core', nameKey: 'items.reactor_starter_core.name', descriptionKey: 'items.reactor_starter_core.description', slot: 'REACTOR' as const, baseStats: { attack: 2, defense: 2 }, maxUpgradeLevel: 5, iconAssetId: 'items.reactor_starter_core.icon', isStarterItem: true },
      { key: 'utility_starter_scanner', nameKey: 'items.utility_starter_scanner.name', descriptionKey: 'items.utility_starter_scanner.description', slot: 'UTILITY' as const, baseStats: { attack: 1 }, maxUpgradeLevel: 5, iconAssetId: 'items.utility_starter_scanner.icon', isStarterItem: true },
      { key: 'weapon_pulse_cannon', nameKey: 'items.weapon_pulse_cannon.name', descriptionKey: 'items.weapon_pulse_cannon.description', slot: 'WEAPON' as const, baseStats: { attack: 12 }, maxUpgradeLevel: 8, iconAssetId: 'items.weapon_pulse_cannon.icon', isStarterItem: false },
      { key: 'hull_reinforced_plating', nameKey: 'items.hull_reinforced_plating.name', descriptionKey: 'items.hull_reinforced_plating.description', slot: 'HULL' as const, baseStats: { hp: 30, defense: 5 }, maxUpgradeLevel: 8, iconAssetId: 'items.hull_reinforced_plating.icon', isStarterItem: false },
    ].map((data) => prisma.itemDefinition.upsert({ where: { key: data.key }, update: {}, create: data })),
  );
  const [, , , , , , pulseCannon, reinforcedPlating] = itemDefinitions;

  await prisma.lootDrop.deleteMany({ where: { pentiliId: { in: [skitterling.id, mossback.id, ridgefang.id] } } });
  await prisma.lootDrop.createMany({
    data: [
      { pentiliId: skitterling.id, resourceType: 'METAL', dropChance: 0.8, minQuantity: 5, maxQuantity: 15 },
      { pentiliId: skitterling.id, resourceType: 'UPGRADE_STONES', dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: mossback.id, resourceType: 'CRYSTAL', dropChance: 0.5, minQuantity: 3, maxQuantity: 8 },
      { pentiliId: mossback.id, itemDefinitionId: pulseCannon.id, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: ridgefang.id, resourceType: 'CREDITS', dropChance: 0.6, minQuantity: 10, maxQuantity: 20 },
      { pentiliId: ridgefang.id, itemDefinitionId: reinforcedPlating.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
    ],
  });

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
  ];
  for (const threshold of levelThresholds) {
    await prisma.levelThreshold.upsert({ where: { level: threshold.level }, update: {}, create: threshold });
  }

  console.log('Seeded Milestone 1 static content.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
