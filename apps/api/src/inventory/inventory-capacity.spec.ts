import { GAME_BALANCE } from '../config/game-config';
import { getEffectiveInventoryCapacity, grantItem } from './inventory-capacity';

describe('inventory-capacity', () => {
  let tx: {
    playerBuilding: { findMany: jest.Mock };
    itemInstance: { count: jest.Mock; findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    itemDefinition: { findUniqueOrThrow: jest.Mock };
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      playerBuilding: { findMany: jest.fn().mockResolvedValue([]) },
      itemInstance: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      itemDefinition: { findUniqueOrThrow: jest.fn() },
      // Advisory lock serializing concurrent CONSUMABLE stacking — a no-op against this mock tx.
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('getEffectiveInventoryCapacity', () => {
    it('returns the base capacity with no capacity-granting buildings', async () => {
      const capacity = await getEffectiveInventoryCapacity('p1', tx as never);
      expect(capacity).toBe(GAME_BALANCE.inventory.baseCapacity);
    });

    it('adds the Warehouse bonus on top of the base capacity', async () => {
      tx.playerBuilding.findMany.mockResolvedValue([{ level: 4, buildingType: { capacityBonusPerLevel: 3 } }]);

      const capacity = await getEffectiveInventoryCapacity('p1', tx as never);

      expect(capacity).toBe(GAME_BALANCE.inventory.baseCapacity + 12);
    });
  });

  describe('grantItem', () => {
    it('stacks a consumable onto its existing row without checking capacity', async () => {
      tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'CONSUMABLE' });
      tx.itemInstance.findFirst.mockResolvedValue({ id: 'inst1' });

      const granted = await grantItem('p1', 'def1', tx as never);

      expect(granted).toBe(true);
      expect(tx.itemInstance.update).toHaveBeenCalledWith({ where: { id: 'inst1' }, data: { quantity: { increment: 1 } } });
      expect(tx.itemInstance.count).not.toHaveBeenCalled();
    });

    it('acquires an advisory lock before checking for an existing CONSUMABLE stack (prevents a create-vs-create race between concurrent grants)', async () => {
      tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'CONSUMABLE' });
      tx.itemInstance.findFirst.mockResolvedValue({ id: 'inst1' });

      await grantItem('p1', 'def1', tx as never);

      expect(tx.$executeRaw).toHaveBeenCalled();
      const lockCallOrder = tx.$executeRaw.mock.invocationCallOrder[0];
      const findFirstCallOrder = tx.itemInstance.findFirst.mock.invocationCallOrder[0];
      expect(lockCallOrder).toBeLessThan(findFirstCallOrder);
    });

    it('creates a new row for a first-time consumable pickup when under capacity', async () => {
      tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'CONSUMABLE', tier: null, slot: null });
      tx.itemInstance.findFirst.mockResolvedValue(null);
      tx.itemInstance.count.mockResolvedValue(0);
      tx.playerBuilding.findMany.mockResolvedValue([]);

      const granted = await grantItem('p1', 'def1', tx as never);

      expect(granted).toBe(true);
      // Consumables never roll rarity/race — quality/rolledOptions/race stay at their defaults.
      expect(tx.itemInstance.create).toHaveBeenCalledWith({
        data: { playerId: 'p1', itemDefinitionId: 'def1', race: null, quality: 'NORMAL', rolledOptions: [] },
      });
    });

    it('refuses a new item once the player is at capacity', async () => {
      tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'PIONEER', slot: 'HEAD' });
      tx.itemInstance.count.mockResolvedValue(GAME_BALANCE.inventory.baseCapacity);

      const granted = await grantItem('p1', 'def1', tx as never);

      expect(granted).toBe(false);
      expect(tx.itemInstance.create).not.toHaveBeenCalled();
    });

    describe('race stamping', () => {
      afterEach(() => jest.restoreAllMocks());

      it('stamps a random race only for COREFORGED-tier equipment', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'COREFORGED', slot: 'HEAD' });
        tx.itemInstance.count.mockResolvedValue(0);
        // 1st random() picks the race index (0 -> LUXARI), 2nd is the rarity roll (0.9 -> not rare).
        jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9);

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: 'LUXARI', quality: 'NORMAL', rolledOptions: [] },
        });
      });

      it('never stamps a race for PIONEER-tier equipment', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'PIONEER', slot: 'HEAD' });
        tx.itemInstance.count.mockResolvedValue(0);
        jest.spyOn(Math, 'random').mockReturnValue(0.9); // not rare; race roll should never even be attempted

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ race: null }) }));
      });

      it('rolls universal for ASCENDANT within the 1/6 universal chance', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'ASCENDANT', slot: 'HEAD' });
        tx.itemInstance.count.mockResolvedValue(0);
        // 1st random() is the universal-chance roll (0 < 1/6 -> universal), 2nd is the rarity roll (0.9 -> not rare).
        jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9);

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: null, quality: 'NORMAL', rolledOptions: [] },
        });
      });

      it('rolls a locked race for ASCENDANT outside the 1/6 universal chance', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'ASCENDANT', slot: 'HEAD' });
        tx.itemInstance.count.mockResolvedValue(0);
        // 1st random() misses the 1/6 universal chance, 2nd picks the race index (0 -> LUXARI), 3rd is the rarity roll (0.9 -> not rare).
        jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0).mockReturnValueOnce(0.9);

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: 'LUXARI', quality: 'NORMAL', rolledOptions: [] },
        });
      });

      it('never stamps a race for a COREFORGED-tier CONSUMABLE (e.g. the coreforged_upgrade material)', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'CONSUMABLE', tier: 'COREFORGED', slot: null });
        tx.itemInstance.findFirst.mockResolvedValue(null); // first-ever pickup, no existing stack to merge onto
        tx.itemInstance.count.mockResolvedValue(0);
        jest.spyOn(Math, 'random').mockReturnValue(0); // would incorrectly pick a race AND roll rare if the category check were missing

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: null, quality: 'NORMAL', rolledOptions: [] },
        });
      });
    });

    describe('rarity rolling', () => {
      afterEach(() => jest.restoreAllMocks());

      it('rolls one option from the weapon pool for a rare LEFT_ARM/RIGHT_ARM item', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'PIONEER', slot: 'LEFT_ARM' });
        tx.itemInstance.count.mockResolvedValue(0);
        // 1st random() is the rarity roll (0 -> rare), 2nd picks the option index (0.9 -> last of the 2-item weapon pool).
        jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9);

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: null, quality: 'RARE', rolledOptions: ['CRITICAL_DAMAGE'] },
        });
      });

      it('rolls one option from the armor pool for a rare non-weapon-slot item', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'PIONEER', slot: 'ARMOR' });
        tx.itemInstance.count.mockResolvedValue(0);
        jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);

        await grantItem('p1', 'def1', tx as never);

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: null, quality: 'RARE', rolledOptions: ['INCREASE_MAX_HP'] },
        });
      });
    });

    describe('EPIC quality (forced via overrides.quality, e.g. a loot box)', () => {
      afterEach(() => jest.restoreAllMocks());

      it('rolls both options for an EPIC weapon-slot item (its pool only has 2 entries)', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'PIONEER', slot: 'LEFT_ARM' });
        tx.itemInstance.count.mockResolvedValue(0);
        jest.spyOn(Math, 'random').mockReturnValue(0);

        await grantItem('p1', 'def1', tx as never, { quality: 'EPIC' });

        expect(tx.itemInstance.create).toHaveBeenCalledWith({
          data: { playerId: 'p1', itemDefinitionId: 'def1', race: null, quality: 'EPIC', rolledOptions: ['INCREASE_DAMAGE', 'CRITICAL_DAMAGE'] },
        });
      });

      it('rolls 2 distinct options for an EPIC armor-slot item (its pool has 3 entries)', async () => {
        tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT', tier: 'PIONEER', slot: 'ARMOR' });
        tx.itemInstance.count.mockResolvedValue(0);
        jest.spyOn(Math, 'random').mockReturnValue(0);

        await grantItem('p1', 'def1', tx as never, { quality: 'EPIC' });

        const call = tx.itemInstance.create.mock.calls[0][0];
        expect(call.data.quality).toBe('EPIC');
        expect(call.data.rolledOptions).toHaveLength(2);
        expect(new Set(call.data.rolledOptions).size).toBe(2); // no duplicate option
      });
    });
  });
});
