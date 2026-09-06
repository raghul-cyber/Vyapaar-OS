import { expect, test } from 'vitest';
import { whatIf } from './whatIf';
import { Invoice, Expense, Transaction, InventoryItem } from './types';

test('whatIf scenario decreases runway, risk thresholds match, and recommendations are capped with real IDs', () => {
  const today = new Date('2026-06-01T00:00:00Z');
  
  // Create invoices for biggest customer that will cause a runway drop
  // Target customer: 'c1'
  const invoices: Invoice[] = [
    { id: 'inv1', customerId: 'c1', amount: 5000, issueDate: today, dueDate: new Date('2026-06-15T00:00:00Z'), status: 'UNPAID', paidDate: null, paidAmount: null },
    // Other customer overdue
    { id: 'inv2', customerId: 'c2', amount: 1000, issueDate: new Date('2026-05-01T00:00:00Z'), dueDate: new Date('2026-05-15T00:00:00Z'), status: 'UNPAID', paidDate: null, paidAmount: null }
  ];
  
  const expenses: Expense[] = [
    // Huge scheduled outflow that we depend on inv1 to pay
    { id: 'exp1', category: 'Rent', amount: 3000, date: new Date('2026-06-16T00:00:00Z'), isRecurring: true },
    // Discretionary
    { id: 'exp2', category: 'Marketing', amount: 3000, date: new Date('2026-06-20T00:00:00Z'), isRecurring: false }
  ];
  
  const transactions: Transaction[] = [];
  
  const inventory: InventoryItem[] = [
    { id: 'item1', quantityOnHand: 50, unitCost: 100 } // 5000 total
  ];
  
  const params = {
    currentCash: 1000, // Very low. We need inv1 to survive exp1
    invoices,
    expenses,
    transactions,
    inventory,
    today
  };
  
  const res = whatIf(params);
  
  // (a) scenario runway <= current runway
  expect(res.scenarioRunway).toBeLessThanOrEqual(res.baselineRunway);
  // Specifically, baseline survives past day 15 because 1000 + 5000 (inv1) = 6000 - 3000 (exp1) = 3000. So no shortage until day 90.
  // Scenario drops inv1 out of window (delay 30 days -> dueDate July 15). So on day 15 (June 16), cash is 1000 - 3000 = -2000. Shortage at day 15!
  // Note: the index of June 16 from June 1 is 15.
  
  expect(res.baselineRunway).toBe(90);
  expect(res.scenarioRunway).toBe(15);
  
  const expectedDrop = (90 - 15) / 90; // 75/90 = 83.3%
  expect(res.runwayDropPct).toBeCloseTo(expectedDrop, 3);
  
  // 83.3% > 40% -> HIGH
  expect(res.riskLevel).toBe('HIGH');
  
  // Cash impact should be 5000 (inv1)
  expect(res.cashImpact).toBe(5000);
  
  // (b) Sum of recommendations <= cashImpact
  const totalRecAmount = res.recommendations.reduce((acc, r) => acc + r.amount, 0);
  expect(totalRecAmount).toBeLessThanOrEqual(5000);
  expect(totalRecAmount).toBe(5000); // Because inventory (5000) + overdue (1000) + marketing (3000) = 9000 total available, capped at 5000.
  
  // (c) every recommendation has non-empty sourceRecordIds
  res.recommendations.forEach(r => {
    expect(r.sourceRecordIds.length).toBeGreaterThan(0);
  });
});

import * as forecastModule from './forecast';
import { vi } from 'vitest';

test('whatIf boundary risk thresholds (14%, 15%, 39%, 40%)', () => {
  const today = new Date('2026-06-01T00:00:00Z');
  const params = {
    currentCash: 1000, invoices: [], expenses: [], transactions: [], inventory: [], today, delayDays: 30
  };

  // Mock forecast to return exact runway days to hit percentage boundaries
  const forecastSpy = vi.spyOn(forecastModule, 'forecast');

  // Test 14% (LOW)
  // currentRunway = 100, scenarioRunway = 86 -> drop = 14/100 = 14%
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 100, amount: -10 }] });
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 86, amount: -10 }] });
  expect(whatIf(params).riskLevel).toBe('LOW');

  // Test 15% (MEDIUM)
  // currentRunway = 100, scenarioRunway = 85 -> drop = 15/100 = 15%
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 100, amount: -10 }] });
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 85, amount: -10 }] });
  expect(whatIf(params).riskLevel).toBe('MEDIUM');

  // Test 39% (MEDIUM)
  // currentRunway = 100, scenarioRunway = 61 -> drop = 39/100 = 39%
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 100, amount: -10 }] });
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 61, amount: -10 }] });
  expect(whatIf(params).riskLevel).toBe('MEDIUM');

  // Test 40% (HIGH)
  // currentRunway = 100, scenarioRunway = 60 -> drop = 40/100 = 40%
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 100, amount: -10 }] });
  forecastSpy.mockReturnValueOnce({ projectedCash: [], shortageAlerts: [{ day: 60, amount: -10 }] });
  expect(whatIf(params).riskLevel).toBe('HIGH');

  forecastSpy.mockRestore();
});
