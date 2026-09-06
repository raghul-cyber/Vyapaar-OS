import { expect, test } from 'vitest';
import { paymentBehaviour } from './paymentBehaviour';
import { Invoice } from './types';

test('paymentBehaviour calculates ratios and late days correctly', () => {
  const invoices: Invoice[] = [
    { id: '1', amount: 100, issueDate: new Date(), dueDate: new Date('2026-02-05T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-02-04T00:00:00Z'), paidAmount: 100 },
    { id: '2', amount: 100, issueDate: new Date(), dueDate: new Date('2026-02-05T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-02-15T00:00:00Z'), paidAmount: 100 }
  ];
  const res = paymentBehaviour(invoices);
  expect(res.onTimeRatio).toBe(0.5);
  expect(res.avgDaysLate).toBe(10);
});

test('paymentBehaviour divide by zero guard', () => {
  const res = paymentBehaviour([]);
  expect(res.onTimeRatio).toBeNull();
  expect(res.avgDaysLate).toBeNull();
});
