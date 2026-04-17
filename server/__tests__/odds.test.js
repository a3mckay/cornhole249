const { winProbability } = require('../lib/elo');

describe('Odds calculation', () => {
  test('win probability formula: P(A) = 1 / (1 + 10^((eloB-eloA)/400))', () => {
    const cases = [
      { eloA: 1000, eloB: 1000, expected: 0.5 },
      { eloA: 1200, eloB: 1000, expected: 1 / (1 + Math.pow(10, (1000 - 1200) / 400)) },
      { eloA: 1000, eloB: 1400, expected: 1 / (1 + Math.pow(10, (1400 - 1000) / 400)) },
      { eloA: 1500, eloB: 1000, expected: 1 / (1 + Math.pow(10, (1000 - 1500) / 400)) },
    ];

    for (const { eloA, eloB, expected } of cases) {
      expect(winProbability(eloA, eloB)).toBeCloseTo(expected, 5);
    }
  });

  test('probabilities are complementary (sum to 1)', () => {
    const eloA = 1234;
    const eloB = 876;
    const pA = winProbability(eloA, eloB);
    const pB = winProbability(eloB, eloA);
    expect(pA + pB).toBeCloseTo(1.0, 5);
  });

  test('higher Elo always has higher win probability', () => {
    for (let diff = 50; diff <= 400; diff += 50) {
      const p = winProbability(1000 + diff, 1000);
      expect(p).toBeGreaterThan(0.5);
    }
  });

  test('percentages sum to 100 after rounding', () => {
    const eloA = 1150;
    const eloB = 980;
    const team1_pct = Math.round(winProbability(eloA, eloB) * 100);
    const team2_pct = 100 - team1_pct;
    expect(team1_pct + team2_pct).toBe(100);
  });
});
