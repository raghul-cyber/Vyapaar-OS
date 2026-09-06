import { expect, test } from 'vitest';
import { customerConcentration } from './customerConcentration';

test('customerConcentration calculates share', () => {
  const revs = [
    { customerId: 'c1', revenue: 800 },
    { customerId: 'c2', revenue: 200 }
  ];
  expect(customerConcentration(revs)).toBe(0.8);
});

test('customerConcentration handles divide by zero', () => {
  expect(customerConcentration([])).toBeNull();
  expect(customerConcentration([{ customerId: 'c1', revenue: 0 }])).toBeNull();
});
