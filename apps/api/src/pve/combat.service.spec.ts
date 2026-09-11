import { Pentili } from '@prisma/client';
import { aggregateFormationCombatStats, CombatService, PlayerCombatBreakdown } from './combat.service';

function makeBreakdown(overrides: Partial<PlayerCombatBreakdown> = {}): PlayerCombatBreakdown {
  return {
    base: { attack: 100, defense: 50, hp: 200 },
    attackFactor: 1,
    defenseFactor: 1,
    hpFactor: 1,
    optionTotals: { increaseDamage: 0, increaseMaxHp: 0, criticalDamageBonus: 0, damageDecrease: 0, damageReflect: 0 },
    evasion: 0,
    ...overrides,
  };
}

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

describe('aggregateFormationCombatStats', () => {
  it('reduces to the same result as solo combine for a single filled slot', () => {
    const breakdown = makeBreakdown({ optionTotals: { increaseDamage: 0.02, increaseMaxHp: 0.04, criticalDamageBonus: 0.1, damageDecrease: 0.04, damageReflect: 0.04 } });

    const result = aggregateFormationCombatStats([breakdown]);

    // Matches computePlayerStats' own combine formula: base * (factor + optionTotal).
    expect(result.attack).toBeCloseTo(100 * (1 + 0.02));
    expect(result.defense).toBeCloseTo(50 * 1);
    expect(result.hp).toBeCloseTo(200 * (1 + 0.04));
    expect(result.criticalDamageBonus).toBeCloseTo(0.1);
    expect(result.damageDecrease).toBeCloseTo(0.04);
    // Excluded entirely from formation combat, even when the solo option total is non-zero.
    expect(result.damageReflect).toBe(0);
  });

  it("sums Excellent-option percentages across every filled slot and applies them once to the party's combined raw total", () => {
    const breakdowns = [
      makeBreakdown({ base: { attack: 100, defense: 10, hp: 100 }, optionTotals: { increaseDamage: 0.02, increaseMaxHp: 0, criticalDamageBonus: 0, damageDecrease: 0, damageReflect: 0 } }),
      makeBreakdown({ base: { attack: 200, defense: 10, hp: 100 }, optionTotals: { increaseDamage: 0.02, increaseMaxHp: 0, criticalDamageBonus: 0, damageDecrease: 0, damageReflect: 0 } }),
      makeBreakdown({ base: { attack: 300, defense: 10, hp: 100 }, optionTotals: { increaseDamage: 0.02, increaseMaxHp: 0, criticalDamageBonus: 0, damageDecrease: 0, damageReflect: 0 } }),
    ];

    const result = aggregateFormationCombatStats(breakdowns);

    // Raw attack sums to 600, then the 3 players' +2% each (6% total) applies ONCE to the whole
    // sum — deliberately stronger than summing each player's own 102/204/306 individually (612).
    expect(result.attack).toBeCloseTo(600 * 1.06);
    expect(result.defense).toBeCloseTo(30);
  });

  it('caps summed Damage Decrease at GAME_BALANCE.bossFormations.maxDamageDecrease', () => {
    const breakdowns = Array.from({ length: 5 }, () => makeBreakdown({ optionTotals: { increaseDamage: 0, increaseMaxHp: 0, criticalDamageBonus: 0, damageDecrease: 0.3, damageReflect: 0 } }));

    const result = aggregateFormationCombatStats(breakdowns);

    // 5 * 0.3 = 1.5, capped to 0.9.
    expect(result.damageDecrease).toBeCloseTo(0.9);
  });

  it('averages evasion across filled slots', () => {
    const breakdowns = [makeBreakdown({ evasion: 0.2 }), makeBreakdown({ evasion: 0.4 })];

    const result = aggregateFormationCombatStats(breakdowns);

    expect(result.evasion).toBeCloseTo(0.3);
  });

  it('returns zeroed stats for an empty formation without throwing', () => {
    const result = aggregateFormationCombatStats([]);

    expect(result).toEqual({ attack: 0, defense: 0, hp: 0, evasion: 0, criticalDamageBonus: 0, damageDecrease: 0, damageReflect: 0 });
  });
});
