import { Pentili } from '@prisma/client';
import { CombatService } from './combat.service';

function makePentili(overrides: Partial<Pentili> = {}): Pentili {
  return {
    id: 'pentili-1',
    key: 'test_pentili',
    nameKey: 'pentili.test.name',
    zoneId: 'zone-1',
    level: 1,
    maxHp: 20,
    attack: 5,
    defense: 1,
    xpReward: 10,
    iconAssetId: 'pentili.test.icon',
    ...overrides,
  };
}

describe('CombatService', () => {
  let combat: CombatService;
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    const economy = { getResearchMultiplier: jest.fn().mockResolvedValue(1) };
    const clanBonus = { getBonus: jest.fn().mockResolvedValue(0) };
    combat = new CombatService(undefined as never, economy as never, clanBonus as never);
  });

  afterEach(() => {
    randomSpy?.mockRestore();
  });

  it('wins and stops rounds once the Pentili reaches 0 HP', () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = combat.simulate({ attack: 50, defense: 10, hp: 100 }, makePentili({ maxHp: 20 }));

    expect(result.won).toBe(true);
    expect(result.rounds.length).toBeGreaterThan(0);
    const lastRound = result.rounds[result.rounds.length - 1];
    expect(lastRound.pentiliHpAfter).toBe(0);
    expect(lastRound.pentiliDamage).toBe(0); // the killing round doesn't let the Pentili hit back
  });

  it('loses once the player reaches 0 HP', () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = combat.simulate({ attack: 1, defense: 0, hp: 5 }, makePentili({ maxHp: 1000, attack: 50, defense: 0 }));

    expect(result.won).toBe(false);
    const lastRound = result.rounds[result.rounds.length - 1];
    expect(lastRound.playerHpAfter).toBe(0);
  });

  it('never exceeds the configured round cap', () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    // Perfectly matched stats with heavy defense mean tiny (floor-1) damage each way for a long time.
    const result = combat.simulate({ attack: 1, defense: 1000, hp: 100_000 }, makePentili({ maxHp: 100_000, attack: 1, defense: 1000 }));

    expect(result.rounds.length).toBeLessThanOrEqual(30);
  });
});
