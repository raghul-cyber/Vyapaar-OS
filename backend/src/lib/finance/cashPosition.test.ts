import { expect, test } from 'vitest';
import { cashPosition } from './cashPosition';

test('cashPosition calculates correctly', () => {
  const txs = [
    { id: '1', amount: 1000, type: 'INFLOW', date: new Date() },
    { id: '2', amount: 300, type: 'OUTFLOW', date: new Date() }
  ];
  expect(cashPosition(txs)).toBe(700);
});
