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
      create: { key: 'zone_verdant_flats', nameKey: 'zones.verdant_flats.name', order: 1, unlockLevel: 1, iconAssetId: 'zones.verdant_flats.icon' },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_ashen_ridge' },
      update: {},
      create: { key: 'zone_ashen_ridge', nameKey: 'zones.ashen_ridge.name', order: 2, unlockLevel: 3, iconAssetId: 'zones.ashen_ridge.icon' },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_crimson_wastes' },
      update: {},
      create: { key: 'zone_crimson_wastes', nameKey: 'zones.crimson_wastes.name', order: 3, unlockLevel: 6, iconAssetId: 'zones.crimson_wastes.icon' },
    }),
    prisma.zone.upsert({
      where: { key: 'zone_frostbound_reach' },
      update: {},
      create: { key: 'zone_frostbound_reach', nameKey: 'zones.frostbound_reach.name', order: 4, unlockLevel: 9, iconAssetId: 'zones.frostbound_reach.icon' },
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
      // capacityBonusPerLevel: raises personal inventory capacity — owner
      // decision, resolving the Warehouse's previous lack of any coded effect.
      { key: 'warehouse', nameKey: 'buildings.warehouse.name', maxLevel: 10, iconAssetId: 'buildings.warehouse.icon', capacityBonusPerLevel: 3 },
      // update: data (not {}) — capacityBonusPerLevel must follow this list
      // when it changes, not freeze at whatever an existing row already has.
    ].map((data) => prisma.buildingType.upsert({ where: { key: data.key }, update: data, create: data })),
  );
  const [metalMine, crystalExtractor, warehouse] = buildingTypes;

  const levelCosts = [
    { buildingTypeId: metalMine.id, level: 1, metalCost: 0, crystalCost: 50, constructionSeconds: 60, producesResourceType: 'METAL' as const, producesPerHour: 100 },
    { buildingTypeId: metalMine.id, level: 2, metalCost: 0, crystalCost: 120, constructionSeconds: 180, producesResourceType: 'METAL' as const, producesPerHour: 220 },
    { buildingTypeId: metalMine.id, level: 3, metalCost: 0, crystalCost: 250, constructionSeconds: 420, producesResourceType: 'METAL' as const, producesPerHour: 400 },
    // Levels 4-10 (maxLevel is already 10 on the BuildingType) — continues the
    // same placeholder curve as levels 1-3 (see instructions/OPEN_DECISIONS.md's
    // "Construction costs/times, building production rates").
    { buildingTypeId: metalMine.id, level: 4, metalCost: 0, crystalCost: 480, constructionSeconds: 900, producesResourceType: 'METAL' as const, producesPerHour: 700 },
    { buildingTypeId: metalMine.id, level: 5, metalCost: 0, crystalCost: 900, constructionSeconds: 1800, producesResourceType: 'METAL' as const, producesPerHour: 1200 },
    { buildingTypeId: metalMine.id, level: 6, metalCost: 0, crystalCost: 1700, constructionSeconds: 3600, producesResourceType: 'METAL' as const, producesPerHour: 2000 },
    { buildingTypeId: metalMine.id, level: 7, metalCost: 0, crystalCost: 3200, constructionSeconds: 7200, producesResourceType: 'METAL' as const, producesPerHour: 3400 },
    { buildingTypeId: metalMine.id, level: 8, metalCost: 0, crystalCost: 6000, constructionSeconds: 14400, producesResourceType: 'METAL' as const, producesPerHour: 5600 },
    { buildingTypeId: metalMine.id, level: 9, metalCost: 0, crystalCost: 11000, constructionSeconds: 28800, producesResourceType: 'METAL' as const, producesPerHour: 9200 },
    { buildingTypeId: metalMine.id, level: 10, metalCost: 0, crystalCost: 20000, constructionSeconds: 57600, producesResourceType: 'METAL' as const, producesPerHour: 15000 },
    { buildingTypeId: crystalExtractor.id, level: 1, metalCost: 80, crystalCost: 0, constructionSeconds: 90, producesResourceType: 'CRYSTAL' as const, producesPerHour: 60 },
    { buildingTypeId: crystalExtractor.id, level: 2, metalCost: 180, crystalCost: 0, constructionSeconds: 240, producesResourceType: 'CRYSTAL' as const, producesPerHour: 130 },
    { buildingTypeId: crystalExtractor.id, level: 3, metalCost: 350, crystalCost: 0, constructionSeconds: 480, producesResourceType: 'CRYSTAL' as const, producesPerHour: 240 },
    { buildingTypeId: crystalExtractor.id, level: 4, metalCost: 650, crystalCost: 0, constructionSeconds: 960, producesResourceType: 'CRYSTAL' as const, producesPerHour: 420 },
    { buildingTypeId: crystalExtractor.id, level: 5, metalCost: 1200, crystalCost: 0, constructionSeconds: 1920, producesResourceType: 'CRYSTAL' as const, producesPerHour: 720 },
    { buildingTypeId: crystalExtractor.id, level: 6, metalCost: 2200, crystalCost: 0, constructionSeconds: 3840, producesResourceType: 'CRYSTAL' as const, producesPerHour: 1200 },
    { buildingTypeId: crystalExtractor.id, level: 7, metalCost: 4000, crystalCost: 0, constructionSeconds: 7680, producesResourceType: 'CRYSTAL' as const, producesPerHour: 2000 },
    { buildingTypeId: crystalExtractor.id, level: 8, metalCost: 7200, crystalCost: 0, constructionSeconds: 15360, producesResourceType: 'CRYSTAL' as const, producesPerHour: 3300 },
    { buildingTypeId: crystalExtractor.id, level: 9, metalCost: 13000, crystalCost: 0, constructionSeconds: 30720, producesResourceType: 'CRYSTAL' as const, producesPerHour: 5400 },
    { buildingTypeId: crystalExtractor.id, level: 10, metalCost: 23000, crystalCost: 0, constructionSeconds: 61440, producesResourceType: 'CRYSTAL' as const, producesPerHour: 8800 },
    { buildingTypeId: warehouse.id, level: 1, metalCost: 60, crystalCost: 20, constructionSeconds: 60 },
    { buildingTypeId: warehouse.id, level: 2, metalCost: 150, crystalCost: 60, constructionSeconds: 200 },
    { buildingTypeId: warehouse.id, level: 3, metalCost: 300, crystalCost: 120, constructionSeconds: 400 },
    { buildingTypeId: warehouse.id, level: 4, metalCost: 550, crystalCost: 220, constructionSeconds: 750 },
    { buildingTypeId: warehouse.id, level: 5, metalCost: 1000, crystalCost: 400, constructionSeconds: 1500 },
    { buildingTypeId: warehouse.id, level: 6, metalCost: 1800, crystalCost: 720, constructionSeconds: 3000 },
    { buildingTypeId: warehouse.id, level: 7, metalCost: 3200, crystalCost: 1300, constructionSeconds: 6000 },
    { buildingTypeId: warehouse.id, level: 8, metalCost: 5800, crystalCost: 2300, constructionSeconds: 12000 },
    { buildingTypeId: warehouse.id, level: 9, metalCost: 10000, crystalCost: 4100, constructionSeconds: 24000 },
    { buildingTypeId: warehouse.id, level: 10, metalCost: 18000, crystalCost: 7300, constructionSeconds: 48000 },
  ];
  for (const cost of levelCosts) {
    await prisma.buildingLevelCost.upsert({
      where: { buildingTypeId_level: { buildingTypeId: cost.buildingTypeId, level: cost.level } },
      update: {},
      create: cost,
    });
  }

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
    // Pioneer — starter tier, granted free to every new robot (Player.isStarterItem).
    { key: 'pioneer_head_scanner', slot: 'HEAD' as const, tier: 'PIONEER' as const, baseStats: { attack: 1 }, maxUpgradeLevel: 5, isStarterItem: true },
    { key: 'pioneer_left_arm_blaster', slot: 'LEFT_ARM' as const, tier: 'PIONEER' as const, baseStats: { attack: 5 }, maxUpgradeLevel: 5, isStarterItem: true },
    { key: 'pioneer_right_arm_guard', slot: 'RIGHT_ARM' as const, tier: 'PIONEER' as const, baseStats: { defense: 5 }, maxUpgradeLevel: 5, isStarterItem: true },
    { key: 'pioneer_armor_plating', slot: 'ARMOR' as const, tier: 'PIONEER' as const, baseStats: { hp: 15, defense: 2 }, maxUpgradeLevel: 5, isStarterItem: true },
    { key: 'pioneer_core_battery', slot: 'CORE' as const, tier: 'PIONEER' as const, baseStats: { attack: 2, defense: 2 }, maxUpgradeLevel: 5, isStarterItem: true },
    { key: 'pioneer_left_leg_actuator', slot: 'LEFT_LEG' as const, tier: 'PIONEER' as const, baseStats: { hp: 5 }, maxUpgradeLevel: 5, isStarterItem: true },
    { key: 'pioneer_right_leg_actuator', slot: 'RIGHT_LEG' as const, tier: 'PIONEER' as const, baseStats: { hp: 5 }, maxUpgradeLevel: 5, isStarterItem: true },
    // Ascendant — advanced tier, 2x Pioneer.
    { key: 'ascendant_head_scanner', slot: 'HEAD' as const, tier: 'ASCENDANT' as const, baseStats: { attack: 4 }, maxUpgradeLevel: 8, isStarterItem: false },
    { key: 'ascendant_left_arm_blaster', slot: 'LEFT_ARM' as const, tier: 'ASCENDANT' as const, baseStats: { attack: 12 }, maxUpgradeLevel: 8, isStarterItem: false },
    { key: 'ascendant_right_arm_guard', slot: 'RIGHT_ARM' as const, tier: 'ASCENDANT' as const, baseStats: { defense: 10 }, maxUpgradeLevel: 8, isStarterItem: false },
    { key: 'ascendant_armor_plating', slot: 'ARMOR' as const, tier: 'ASCENDANT' as const, baseStats: { hp: 30, defense: 5 }, maxUpgradeLevel: 8, isStarterItem: false },
    { key: 'ascendant_core_battery', slot: 'CORE' as const, tier: 'ASCENDANT' as const, baseStats: { attack: 6, defense: 4 }, maxUpgradeLevel: 8, isStarterItem: false },
    { key: 'ascendant_left_leg_actuator', slot: 'LEFT_LEG' as const, tier: 'ASCENDANT' as const, baseStats: { hp: 20 }, maxUpgradeLevel: 8, isStarterItem: false },
    { key: 'ascendant_right_leg_actuator', slot: 'RIGHT_LEG' as const, tier: 'ASCENDANT' as const, baseStats: { hp: 20 }, maxUpgradeLevel: 8, isStarterItem: false },
    // Coreforged — elite tier, 2x Ascendant. Race-locked per dropped instance
    // (ItemInstance.race), rolled by inventory-capacity.ts's grantItem — not here.
    { key: 'coreforged_head_scanner', slot: 'HEAD' as const, tier: 'COREFORGED' as const, baseStats: { attack: 8 }, maxUpgradeLevel: 10, isStarterItem: false },
    { key: 'coreforged_left_arm_blaster', slot: 'LEFT_ARM' as const, tier: 'COREFORGED' as const, baseStats: { attack: 24 }, maxUpgradeLevel: 10, isStarterItem: false },
    { key: 'coreforged_right_arm_guard', slot: 'RIGHT_ARM' as const, tier: 'COREFORGED' as const, baseStats: { defense: 20 }, maxUpgradeLevel: 10, isStarterItem: false },
    { key: 'coreforged_armor_plating', slot: 'ARMOR' as const, tier: 'COREFORGED' as const, baseStats: { hp: 60, defense: 10 }, maxUpgradeLevel: 10, isStarterItem: false },
    { key: 'coreforged_core_battery', slot: 'CORE' as const, tier: 'COREFORGED' as const, baseStats: { attack: 12, defense: 8 }, maxUpgradeLevel: 10, isStarterItem: false },
    { key: 'coreforged_left_leg_actuator', slot: 'LEFT_LEG' as const, tier: 'COREFORGED' as const, baseStats: { hp: 40 }, maxUpgradeLevel: 10, isStarterItem: false },
    { key: 'coreforged_right_leg_actuator', slot: 'RIGHT_LEG' as const, tier: 'COREFORGED' as const, baseStats: { hp: 40 }, maxUpgradeLevel: 10, isStarterItem: false },
  ].map((item) => ({
    ...item,
    nameKey: `items.${item.key}.name`,
    descriptionKey: `items.${item.key}.description`,
    iconAssetId: `items.${item.key}.icon`,
  }));

  const itemData = [
    ...equipmentData,
    // Consumables (general inventory, owner decision) — no slot, stack in one
    // ItemInstance row via quantity. baseStats holds { energy } instead of
    // combat stats — read by inventory.service.ts's useConsumable().
    { key: 'energy_pack_small', nameKey: 'items.energy_pack_small.name', descriptionKey: 'items.energy_pack_small.description', slot: null, category: 'CONSUMABLE' as const, baseStats: { energy: 5 }, maxUpgradeLevel: 0, iconAssetId: 'items.energy_pack_small.icon', isStarterItem: false },
    { key: 'energy_pack_large', nameKey: 'items.energy_pack_large.name', descriptionKey: 'items.energy_pack_large.description', slot: null, category: 'CONSUMABLE' as const, baseStats: { energy: 10 }, maxUpgradeLevel: 0, iconAssetId: 'items.energy_pack_large.icon', isStarterItem: false },
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
      iconAssetId: 'items.construction_speedup_small.icon',
      isStarterItem: false,
    },
    {
      key: 'construction_speedup_large',
      nameKey: 'items.construction_speedup_large.name',
      descriptionKey: 'items.construction_speedup_large.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      baseStats: { buildTimeReductionMinutes: 10 },
      maxUpgradeLevel: 0,
      iconAssetId: 'items.construction_speedup_large.icon',
      isStarterItem: false,
    },
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
      iconAssetId: 'items.pioneer_upgrade.icon',
      isStarterItem: false,
    },
    {
      key: 'ascendant_upgrade',
      nameKey: 'items.ascendant_upgrade.name',
      descriptionKey: 'items.ascendant_upgrade.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'ASCENDANT' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.ascendant_upgrade.icon',
      isStarterItem: false,
    },
    {
      key: 'coreforged_upgrade',
      nameKey: 'items.coreforged_upgrade.name',
      descriptionKey: 'items.coreforged_upgrade.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'COREFORGED' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.coreforged_upgrade.icon',
      isStarterItem: false,
    },
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
      iconAssetId: 'items.pioneer_fragment.icon',
      isStarterItem: false,
    },
    {
      key: 'ascendant_fragment',
      nameKey: 'items.ascendant_fragment.name',
      descriptionKey: 'items.ascendant_fragment.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'ASCENDANT' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.ascendant_fragment.icon',
      isStarterItem: false,
    },
    {
      key: 'coreforged_fragment',
      nameKey: 'items.coreforged_fragment.name',
      descriptionKey: 'items.coreforged_fragment.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'COREFORGED' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.coreforged_fragment.icon',
      isStarterItem: false,
    },
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
      iconAssetId: 'items.pioneer_box.icon',
      isStarterItem: false,
    },
    {
      key: 'ascendant_box',
      nameKey: 'items.ascendant_box.name',
      descriptionKey: 'items.ascendant_box.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'ASCENDANT' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.ascendant_box.icon',
      isStarterItem: false,
    },
    {
      key: 'coreforged_box',
      nameKey: 'items.coreforged_box.name',
      descriptionKey: 'items.coreforged_box.description',
      slot: null,
      category: 'CONSUMABLE' as const,
      tier: 'COREFORGED' as const,
      baseStats: {},
      maxUpgradeLevel: 0,
      iconAssetId: 'items.coreforged_box.icon',
      isStarterItem: false,
    },
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
    itemsByKey[data.key] = await prisma.itemDefinition.upsert({ where: { key: data.key }, update: priced, create: priced });
  }

  const allPentiliIds = Object.values(pentiliByKey).map((p) => p.id);
  await prisma.lootDrop.deleteMany({ where: { pentiliId: { in: allPentiliIds } } });
  await prisma.lootDrop.createMany({
    data: [
      // Zone 1 (Verdant Flats) — Pioneer tier only, per owner decision.
      { pentiliId: skitterling.id, resourceType: 'METAL', dropChance: 0.8, minQuantity: 5, maxQuantity: 15 },
      { pentiliId: skitterling.id, itemDefinitionId: itemsByKey.pioneer_upgrade.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: skitterling.id, itemDefinitionId: itemsByKey.energy_pack_small.id, dropChance: 0.12, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: skitterling.id, itemDefinitionId: itemsByKey.pioneer_head_scanner.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: skitterling.id, itemDefinitionId: itemsByKey.pioneer_left_arm_blaster.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: skitterling.id, itemDefinitionId: itemsByKey.pioneer_left_leg_actuator.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: mossback.id, resourceType: 'CRYSTAL', dropChance: 0.5, minQuantity: 3, maxQuantity: 8 },
      { pentiliId: mossback.id, itemDefinitionId: itemsByKey.construction_speedup_small.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: mossback.id, itemDefinitionId: itemsByKey.pioneer_right_arm_guard.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: mossback.id, itemDefinitionId: itemsByKey.pioneer_armor_plating.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: mossback.id, itemDefinitionId: itemsByKey.pioneer_core_battery.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: mossback.id, itemDefinitionId: itemsByKey.pioneer_right_leg_actuator.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },

      // Zone 2 (Ashen Ridge) — Ascendant tier introduced.
      { pentiliId: ridgefang.id, resourceType: 'CREDITS', dropChance: 0.6, minQuantity: 10, maxQuantity: 20 },
      { pentiliId: ridgefang.id, itemDefinitionId: itemsByKey.ascendant_upgrade.id, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: ridgefang.id, itemDefinitionId: itemsByKey.ascendant_head_scanner.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: ridgefang.id, itemDefinitionId: itemsByKey.ascendant_left_arm_blaster.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: ridgefang.id, itemDefinitionId: itemsByKey.ascendant_left_leg_actuator.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: cinderclaw.id, resourceType: 'METAL', dropChance: 0.6, minQuantity: 15, maxQuantity: 30 },
      { pentiliId: cinderclaw.id, itemDefinitionId: itemsByKey.ascendant_upgrade.id, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: cinderclaw.id, itemDefinitionId: itemsByKey.ascendant_right_arm_guard.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: cinderclaw.id, itemDefinitionId: itemsByKey.ascendant_armor_plating.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: cinderclaw.id, itemDefinitionId: itemsByKey.ascendant_core_battery.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: cinderclaw.id, itemDefinitionId: itemsByKey.ascendant_right_leg_actuator.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },

      // Zone 3 (Crimson Wastes) — Coreforged tier introduced (race-locked per drop, low chance).
      { pentiliId: duskfang.id, resourceType: 'CRYSTAL', dropChance: 0.55, minQuantity: 15, maxQuantity: 30 },
      { pentiliId: duskfang.id, resourceType: 'CREDITS', dropChance: 0.4, minQuantity: 20, maxQuantity: 40 },
      { pentiliId: duskfang.id, itemDefinitionId: itemsByKey.energy_pack_large.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: duskfang.id, itemDefinitionId: itemsByKey.coreforged_head_scanner.id, dropChance: 0.04, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: duskfang.id, itemDefinitionId: itemsByKey.coreforged_left_arm_blaster.id, dropChance: 0.04, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: duskfang.id, itemDefinitionId: itemsByKey.coreforged_left_leg_actuator.id, dropChance: 0.04, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: voidling.id, resourceType: 'CREDITS', dropChance: 0.5, minQuantity: 30, maxQuantity: 60 },
      { pentiliId: voidling.id, itemDefinitionId: itemsByKey.coreforged_upgrade.id, dropChance: 0.03, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: voidling.id, itemDefinitionId: itemsByKey.coreforged_right_arm_guard.id, dropChance: 0.04, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: voidling.id, itemDefinitionId: itemsByKey.coreforged_armor_plating.id, dropChance: 0.04, minQuantity: 1, maxQuantity: 1 },

      // Zone 4 (Frostbound Reach) — Coreforged tier continues.
      { pentiliId: glacialwraith.id, resourceType: 'METAL', dropChance: 0.6, minQuantity: 40, maxQuantity: 70 },
      { pentiliId: glacialwraith.id, resourceType: 'CRYSTAL', dropChance: 0.5, minQuantity: 30, maxQuantity: 50 },
      { pentiliId: glacialwraith.id, itemDefinitionId: itemsByKey.construction_speedup_large.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: glacialwraith.id, itemDefinitionId: itemsByKey.coreforged_core_battery.id, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: glacialwraith.id, itemDefinitionId: itemsByKey.coreforged_right_leg_actuator.id, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },

      { pentiliId: stormcaller.id, resourceType: 'CREDITS', dropChance: 0.5, minQuantity: 50, maxQuantity: 90 },
      { pentiliId: stormcaller.id, itemDefinitionId: itemsByKey.coreforged_upgrade.id, dropChance: 0.04, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: stormcaller.id, itemDefinitionId: itemsByKey.coreforged_head_scanner.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
      { pentiliId: stormcaller.id, itemDefinitionId: itemsByKey.coreforged_armor_plating.id, dropChance: 0.06, minQuantity: 1, maxQuantity: 1 },
    ],
  });

  // Durations (1h/5h/10h) are GAME_SYSTEMS.md's own example; rewards taper
  // per-hour as duration grows (short = efficient, long = bigger total,
  // better for offline play) — see instructions/OPEN_DECISIONS.md.
  const expeditionTypes = [
    { key: 'expedition_short', nameKey: 'expeditions.short.name', durationMinutes: 60, metalReward: 60, crystalReward: 20, creditsReward: 10, xpReward: 15, bonusItemDefinitionId: itemsByKey.ascendant_left_leg_actuator.id, bonusItemChance: 0.03 },
    { key: 'expedition_medium', nameKey: 'expeditions.medium.name', durationMinutes: 300, metalReward: 250, crystalReward: 90, creditsReward: 50, xpReward: 70, bonusItemDefinitionId: itemsByKey.ascendant_right_arm_guard.id, bonusItemChance: 0.06 },
    { key: 'expedition_long', nameKey: 'expeditions.long.name', durationMinutes: 600, metalReward: 450, crystalReward: 160, creditsReward: 100, xpReward: 130, bonusItemDefinitionId: itemsByKey.ascendant_core_battery.id, bonusItemChance: 0.1 },
  ];
  for (const data of expeditionTypes) {
    // update: data (not {}) — bonusItemDefinitionId must follow the item catalog
    // when it changes, not freeze at whatever it pointed to on first seed.
    await prisma.expeditionType.upsert({ where: { key: data.key }, update: data, create: data });
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
    bossesByKey[data.key] = await prisma.boss.upsert({ where: { key: data.key }, update: data, create: data });
  }
  const { boss_ridgeback_alpha: ridgebackAlpha, boss_frost_sovereign: frostSovereign } = bossesByKey;

  const allBossIds = Object.values(bossesByKey).map((b) => b.id);
  await prisma.bossLootDrop.deleteMany({ where: { bossId: { in: allBossIds } } });
  await prisma.bossLootDrop.createMany({
    data: [
      { bossId: ridgebackAlpha.id, resourceType: 'METAL', dropChance: 0.9, minQuantity: 50, maxQuantity: 100 },
      { bossId: ridgebackAlpha.id, resourceType: 'CRYSTAL', dropChance: 0.7, minQuantity: 20, maxQuantity: 40 },
      { bossId: ridgebackAlpha.id, itemDefinitionId: itemsByKey.coreforged_left_arm_blaster.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },

      { bossId: frostSovereign.id, resourceType: 'CREDITS', dropChance: 0.9, minQuantity: 100, maxQuantity: 200 },
      { bossId: frostSovereign.id, itemDefinitionId: itemsByKey.coreforged_upgrade.id, dropChance: 0.08, minQuantity: 1, maxQuantity: 2 },
      { bossId: frostSovereign.id, itemDefinitionId: itemsByKey.coreforged_core_battery.id, dropChance: 0.12, minQuantity: 1, maxQuantity: 1 },
      { bossId: frostSovereign.id, itemDefinitionId: itemsByKey.coreforged_armor_plating.id, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
    ],
  });

  // Clan buildings (instructions/GAME_SYSTEMS.md, LOCKED: "Clans are
  // central"): "clan building list" is UNDEFINED — 3 buildings as a working
  // M4 foundation, funded entirely from the clan treasury. Member Hall's
  // bonusPerLevel is a flat extra-slot count, not a percentage. Owner-specified:
  // all 3 buildings develop up to level 10; Member Hall grants +2 slots/level
  // (was +5/level up to level 5).
  const clanBuildingTypes = await Promise.all(
    [
      { key: 'member_hall', nameKey: 'clanBuildings.member_hall.name', descriptionKey: 'clanBuildings.member_hall.description', bonusType: 'MEMBER_CAPACITY' as const, bonusPerLevel: 2, maxLevel: 10, iconAssetId: 'clanBuildings.member_hall.icon' },
      { key: 'clan_forge', nameKey: 'clanBuildings.clan_forge.name', descriptionKey: 'clanBuildings.clan_forge.description', bonusType: 'COMBAT_BONUS' as const, bonusPerLevel: 0.05, maxLevel: 10, iconAssetId: 'clanBuildings.clan_forge.icon' },
      { key: 'clan_depot', nameKey: 'clanBuildings.clan_depot.name', descriptionKey: 'clanBuildings.clan_depot.description', bonusType: 'PRODUCTION_BONUS' as const, bonusPerLevel: 0.05, maxLevel: 10, iconAssetId: 'clanBuildings.clan_depot.icon' },
      // update: data (not {}) — bonusType/bonusPerLevel/maxLevel must follow
      // this list when it changes, not freeze at whatever an existing row has.
    ].map((data) => prisma.clanBuildingType.upsert({ where: { key: data.key }, update: data, create: data })),
  );

  const clanBuildingLevelCosts = clanBuildingTypes.flatMap((buildingType) => [
    { clanBuildingTypeId: buildingType.id, level: 1, metalCost: 500, crystalCost: 200, creditsCost: 100, constructionSeconds: 300 },
    { clanBuildingTypeId: buildingType.id, level: 2, metalCost: 1200, crystalCost: 500, creditsCost: 300, constructionSeconds: 900 },
    { clanBuildingTypeId: buildingType.id, level: 3, metalCost: 2500, crystalCost: 1000, creditsCost: 700, constructionSeconds: 1800 },
    { clanBuildingTypeId: buildingType.id, level: 4, metalCost: 4500, crystalCost: 1800, creditsCost: 1300, constructionSeconds: 3600 },
    { clanBuildingTypeId: buildingType.id, level: 5, metalCost: 7500, crystalCost: 3000, creditsCost: 2200, constructionSeconds: 7200 },
    // Levels 6-10 (owner-specified extension to level 10) continue the same
    // placeholder growth curve as 1-5 — see instructions/OPEN_DECISIONS.md.
    { clanBuildingTypeId: buildingType.id, level: 6, metalCost: 12500, crystalCost: 5000, creditsCost: 3800, constructionSeconds: 14400 },
    { clanBuildingTypeId: buildingType.id, level: 7, metalCost: 20000, crystalCost: 8000, creditsCost: 6200, constructionSeconds: 28800 },
    { clanBuildingTypeId: buildingType.id, level: 8, metalCost: 32000, crystalCost: 13000, creditsCost: 10000, constructionSeconds: 57600 },
    { clanBuildingTypeId: buildingType.id, level: 9, metalCost: 50000, crystalCost: 20000, creditsCost: 16000, constructionSeconds: 115200 },
    { clanBuildingTypeId: buildingType.id, level: 10, metalCost: 78000, crystalCost: 31000, creditsCost: 25000, constructionSeconds: 230400 },
  ]);
  for (const cost of clanBuildingLevelCosts) {
    await prisma.clanBuildingLevelCost.upsert({
      where: { clanBuildingTypeId_level: { clanBuildingTypeId: cost.clanBuildingTypeId, level: cost.level } },
      update: cost,
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
