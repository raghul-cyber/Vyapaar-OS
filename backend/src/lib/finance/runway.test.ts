import { expect, test } from 'vitest';
import { runwayDays } from './runway';

test('runwayDays calculates correctly', () => {
  expect(runwayDays(1000, 10)).toBe(100);
});

test('runwayDays handles zero or negative burn rate (divide by zero guard)', () => {
  expect(runwayDays(1000, 0)).toBe("365+ (stable)");
  expect(runwayDays(1000, -50)).toBe("365+ (stable)");
});
