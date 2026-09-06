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

  it("lets the opponent dodge the player's attack entirely when its evasion is high enough", () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = combat.simulate({ attack: 50, defense: 10, hp: 100 }, { attack: 5, defense: 1, maxHp: 20, evasion: 0.9 });

    expect(result.won).toBe(false);
    expect(result.damageDealt).toBe(0);
    expect(result.rounds.every((round) => round.pentiliDodged && round.playerDamage === 0)).toBe(true);
  });

  it("lets the player dodge the opponent's attack entirely when their evasion is high enough", () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = combat.simulate({ attack: 50, defense: 10, hp: 100, evasion: 0.9 }, makePentili({ maxHp: 1000, attack: 50, defense: 0 }));

    expect(result.won).toBe(true);
    expect(result.damageTaken).toBe(0);
    expect(result.rounds.some((round) => round.playerDodged)).toBe(true);
  });

  it("multiplies damage by the critical multiplier plus the attacker's Critical Damage bonus on a crit", () => {
    randomSpy = jest.spyOn(Math, 'random');
    (randomSpy as jest.SpyInstance)
      .mockReturnValueOnce(0.99) // pentili doesn't dodge
      .mockReturnValueOnce(0.5) // player's hit: neutral variance (1.0)
      .mockReturnValueOnce(0) // player's hit: crit
      .mockReturnValueOnce(0.99) // player doesn't dodge
      .mockReturnValueOnce(0.5) // pentili's hit: neutral variance (1.0)
      .mockReturnValueOnce(0.99); // pentili's hit: not a crit

    const result = combat.simulate(
      { attack: 100, defense: 0, hp: 1000, criticalDamageBonus: 0.2 },
      makePentili({ maxHp: 10_000, attack: 10, defense: 0 }),
    );

    const [firstRound] = result.rounds;
    // Base 100 * (criticalMultiplier 1.5 + bonus 0.2) = 170.
    expect(firstRound.playerCritical).toBe(true);
    expect(firstRound.playerDamage).toBe(170);
    expect(firstRound.pentiliCritical).toBe(false);
    expect(firstRound.pentiliDamage).toBe(10);
  });

  it("reduces incoming damage by the defender's Damage Decrease total", () => {
    randomSpy = jest.spyOn(Math, 'random');
    (randomSpy as jest.SpyInstance)
      .mockReturnValueOnce(0.99) // pentili doesn't dodge
      .mockReturnValueOnce(0.5) // player's hit: neutral variance
      .mockReturnValueOnce(0.99) // player's hit: not a crit
      .mockReturnValueOnce(0.99) // player doesn't dodge
      .mockReturnValueOnce(0.5) // pentili's hit: neutral variance
      .mockReturnValueOnce(0.99); // pentili's hit: not a crit

    const result = combat.simulate(
      { attack: 1, defense: 0, hp: 1000, damageDecrease: 0.5 },
      makePentili({ maxHp: 10_000, attack: 100, defense: 0 }),
    );

    // Base 100 halved by a 50% Damage Decrease.
    expect(result.rounds[0].pentiliDamage).toBe(50);
  });

  it("bounces a share of incoming damage back onto the attacker via the defender's Damage Reflect", () => {
    randomSpy = jest.spyOn(Math, 'random');
    (randomSpy as jest.SpyInstance)
      .mockReturnValueOnce(0.99) // pentili doesn't dodge
      .mockReturnValueOnce(0.5) // player's hit: neutral variance
      .mockReturnValueOnce(0.99) // player's hit: not a crit
      .mockReturnValueOnce(0.99) // player doesn't dodge
      .mockReturnValueOnce(0.5) // pentili's hit: neutral variance
      .mockReturnValueOnce(0.99); // pentili's hit: not a crit

    const result = combat.simulate(
      { attack: 1, defense: 0, hp: 1000, damageReflect: 0.3 },
      makePentili({ maxHp: 10_000, attack: 100, defense: 0 }),
    );

    // 30% of the 100 damage the pentili dealt bounces back onto it.
    expect(result.rounds[0].pentiliReflectedDamage).toBe(30);
  });
});
