import { expect, test } from 'vitest';
import { revenueConsistency } from './revenueConsistency';

test('revenueConsistency calculates CV correctly', () => {
  // mean = 100, stdDev = 0 -> CV = 0
  expect(revenueConsistency([100, 100, 100])).toBe(0);
});

test('revenueConsistency handles divide by zero (mean is 0)', () => {
  expect(revenueConsistency([0, 0, 0])).toBeNull();
  expect(revenueConsistency([])).toBeNull();
});
