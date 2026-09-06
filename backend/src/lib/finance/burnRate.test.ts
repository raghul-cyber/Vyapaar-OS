import { expect, test } from 'vitest';
import { dailyBurnRate } from './burnRate';

test('dailyBurnRate calculates correctly', () => {
  const now = new Date('2026-01-31T00:00:00Z');
  const txs = [
    { id: '1', amount: 900, type: 'OUTFLOW', date: new Date('2026-01-15T00:00:00Z') },
    { id: '2', amount: 300, type: 'INFLOW', date: new Date('2026-01-20T00:00:00Z') }
  ];
  // (900 - 300) / 30 = 20
  expect(dailyBurnRate(txs, now)).toBe(20);
});
