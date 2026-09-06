import { expect, test } from 'vitest';
import { cashFlowStability } from './cashFlowStability';

test('cashFlowStability handles divide by zero', () => {
  expect(cashFlowStability([0, 0, 0])).toBeNull();
  expect(cashFlowStability([])).toBeNull();
});

test('cashFlowStability calculates CV', () => {
  expect(cashFlowStability([100, 100])).toBe(0);
});
