const { mapWmoToCondition } = require('../routes/weather');

describe('WMO weather code mapping', () => {
  test('code 0 → Clear', () => {
    expect(mapWmoToCondition(0)).toBe('Clear');
  });

  test('code 3 → Partly Cloudy', () => {
    expect(mapWmoToCondition(3)).toBe('Partly Cloudy');
  });

  test('code 61 → Rain', () => {
    expect(mapWmoToCondition(61)).toBe('Rain');
  });

  test('code 80 → Rain', () => {
    expect(mapWmoToCondition(80)).toBe('Rain');
  });

  test('code 95 → Thunderstorm', () => {
    expect(mapWmoToCondition(95)).toBe('Thunderstorm');
  });

  test('code 45 → Fog', () => {
    expect(mapWmoToCondition(45)).toBe('Fog');
  });

  test('code 71 → Snow', () => {
    expect(mapWmoToCondition(71)).toBe('Snow');
  });

  test('code 51 → Drizzle', () => {
    expect(mapWmoToCondition(51)).toBe('Drizzle');
  });

  test('code 65 → Heavy Rain', () => {
    expect(mapWmoToCondition(65)).toBe('Heavy Rain');
  });

  test('null/undefined → Unknown', () => {
    expect(mapWmoToCondition(null)).toBe('Unknown');
    expect(mapWmoToCondition(undefined)).toBe('Unknown');
  });
});
