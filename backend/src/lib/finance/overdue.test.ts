import { expect, test } from 'vitest';
import { overdueInvoices } from './overdue';
import { Invoice } from './types';

test('overdueInvoices correctly identifies and calculates days overdue', () => {
  const today = new Date('2026-02-10T00:00:00Z');
  const invoices: Invoice[] = [
    { id: '1', amount: 100, issueDate: new Date(), dueDate: new Date('2026-02-05T00:00:00Z'), status: 'UNPAID', paidDate: null, paidAmount: null },
    { id: '2', amount: 100, issueDate: new Date(), dueDate: new Date('2026-02-15T00:00:00Z'), status: 'UNPAID', paidDate: null, paidAmount: null },
    { id: '3', amount: 100, issueDate: new Date(), dueDate: new Date('2026-02-01T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-02-01T00:00:00Z'), paidAmount: 100 }
  ];
  
  const result = overdueInvoices(invoices, today);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('1');
  expect(result[0].daysOverdue).toBe(5);
});
