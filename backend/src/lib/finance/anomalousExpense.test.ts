import { expect, test } from 'vitest';
import { findAnomalousExpenses } from './anomalousExpense';
import { Expense } from './types';

test('findAnomalousExpenses flags correctly', () => {
  const exps: Expense[] = [
    { id: '1', category: 'Software', amount: 100, date: new Date(), isRecurring: false },
    { id: '2', category: 'Software', amount: 105, date: new Date(), isRecurring: false },
    { id: '3', category: 'Software', amount: 95, date: new Date(), isRecurring: false },
    { id: '5', category: 'Software', amount: 100, date: new Date(), isRecurring: false },
    { id: '6', category: 'Software', amount: 102, date: new Date(), isRecurring: false },
    { id: '7', category: 'Software', amount: 98, date: new Date(), isRecurring: false },
    { id: '8', category: 'Software', amount: 100, date: new Date(), isRecurring: false },
    { id: '4', category: 'Software', amount: 2000, date: new Date(), isRecurring: false } // Anomaly
  ];
  
  const anomalies = findAnomalousExpenses(exps);
  expect(anomalies).toHaveLength(1);
  expect(anomalies[0].expense.id).toBe('4');
});
