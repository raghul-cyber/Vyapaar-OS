import { expect, test } from 'vitest';
import { forecast } from './forecast';

test('forecast calculates correct projections and alerts', () => {
  const today = new Date('2026-01-01T00:00:00Z');
  const params = {
    currentCash: 1000,
    invoices: [
      { id: '1', amount: 500, issueDate: today, dueDate: new Date('2026-01-03T00:00:00Z'), status: 'UNPAID', paidDate: null, paidAmount: null }
    ],
    expenses: [
      { id: '1', category: 'Rent', amount: 2000, date: new Date('2026-01-02T00:00:00Z'), isRecurring: true }
    ],
    transactions: [], // 0 unscheduled -> 0 recurring estimate
    today
  };
  
  const res = forecast(params, 5);
  
  // Day 1: 1000
  // Day 2: 1000 - 2000 = -1000 (Alert!)
  // Day 3: -1000 + 500 = -500 (Alert!)
  // Day 4: -500
  // Day 5: -500
  
  expect(res.projectedCash[0]).toBe(1000);
  expect(res.projectedCash[1]).toBe(-1000);
  expect(res.projectedCash[2]).toBe(-500);
  expect(res.shortageAlerts.length).toBeGreaterThan(0);
  expect(res.shortageAlerts[0].day).toBe(1);
});
