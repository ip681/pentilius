import { GAME_BALANCE } from '../config/game-config';
import { getEffectiveInventoryCapacity, grantItem } from './inventory-capacity';

describe('inventory-capacity', () => {
  let tx: {
    playerBuilding: { findMany: jest.Mock };
    itemInstance: { count: jest.Mock; findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    itemDefinition: { findUniqueOrThrow: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      playerBuilding: { findMany: jest.fn().mockResolvedValue([]) },
      itemInstance: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      itemDefinition: { findUniqueOrThrow: jest.fn() },
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

    it('creates a new row for a first-time consumable pickup when under capacity', async () => {
      tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'CONSUMABLE' });
      tx.itemInstance.findFirst.mockResolvedValue(null);
      tx.itemInstance.count.mockResolvedValue(0);
      tx.playerBuilding.findMany.mockResolvedValue([]);

      const granted = await grantItem('p1', 'def1', tx as never);

      expect(granted).toBe(true);
      expect(tx.itemInstance.create).toHaveBeenCalledWith({ data: { playerId: 'p1', itemDefinitionId: 'def1' } });
    });

    it('refuses a new item once the player is at capacity', async () => {
      tx.itemDefinition.findUniqueOrThrow.mockResolvedValue({ id: 'def1', category: 'EQUIPMENT' });
      tx.itemInstance.count.mockResolvedValue(GAME_BALANCE.inventory.baseCapacity);

      const granted = await grantItem('p1', 'def1', tx as never);

      expect(granted).toBe(false);
      expect(tx.itemInstance.create).not.toHaveBeenCalled();
    });
  });
});
