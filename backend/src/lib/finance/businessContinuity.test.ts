import { expect, test } from 'vitest';
import { monthsActive } from './businessContinuity';
import { Transaction } from './types';

test('monthsActive calculates correctly', () => {
  const today = new Date('2026-04-01T00:00:00Z');
  const txs: Transaction[] = [
    { id: '1', amount: 100, type: 'INFLOW', date: new Date('2026-01-01T00:00:00Z') }
  ];
  const months = monthsActive(txs, today);
  expect(months).toBeCloseTo(90 / 30.44, 1);
});
