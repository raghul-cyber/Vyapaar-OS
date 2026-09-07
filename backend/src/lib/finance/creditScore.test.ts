import { expect, test } from 'vitest';
import { creditScore } from './creditScore';
import { Invoice, Transaction } from './types';
import { CustomerRevenue } from './customerConcentration';

test('creditScore correctly calculates and generates explanation', () => {
  const today = new Date('2026-06-01T00:00:00Z');
  const invoices: Invoice[] = [
    { id: '1', amount: 100, issueDate: new Date('2026-01-01T00:00:00Z'), dueDate: new Date('2026-01-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-01-14T00:00:00Z'), paidAmount: 100 },
    { id: '2', amount: 100, issueDate: new Date('2026-02-01T00:00:00Z'), dueDate: new Date('2026-02-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-02-14T00:00:00Z'), paidAmount: 100 },
    { id: '3', amount: 100, issueDate: new Date('2026-03-01T00:00:00Z'), dueDate: new Date('2026-03-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-03-14T00:00:00Z'), paidAmount: 100 }
  ];
  
  const transactions: Transaction[] = [
    { id: '1', amount: 100, type: 'INFLOW', date: new Date('2025-01-01T00:00:00Z') } // approx 17 months
  ];
  
  const customerRevenues: CustomerRevenue[] = [
    { customerId: 'c1', revenue: 50 },
    { customerId: 'c2', revenue: 50 }
  ];
  
  const params = {
    monthlyRevenue: [1000, 1000, 1000], // CV = 0 -> subScore 100
    invoices, // 3/3 paid on time -> pbScore = 100
    monthlyNetCashFlow: [200, 200, 200], // CV = 0 -> cfScore 100
    transactions, // 17 months active -> (17/24)*100 = 70.8
    customerRevenues, // 50% top -> subScore 50
    today
  };
  
  const result = creditScore(params);
  
  expect(result.score).toBeGreaterThan(0);
  expect(result.score).toBeLessThanOrEqual(100);
  expect(result.explanation).toContain('Score driven up by');
  expect(result.explanation).toContain('held back by');
});

test('creditScore - changing ONLY payment behaviour input changes ONLY payment behaviour sub-score', () => {
  const today = new Date('2026-06-01T00:00:00Z');
  
  const invoicesBase: Invoice[] = [
    { id: '1', amount: 100, issueDate: new Date('2026-01-01T00:00:00Z'), dueDate: new Date('2026-01-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-01-14T00:00:00Z'), paidAmount: 100 }
  ];
  
  // Same base inputs
  const monthlyRevenue = [1000, 1000, 1000];
  const monthlyNetCashFlow = [200, 200, 200];
  const transactions: Transaction[] = [{ id: '1', amount: 100, type: 'INFLOW', date: new Date('2025-01-01T00:00:00Z') }];
  const customerRevenues: CustomerRevenue[] = [{ customerId: 'c1', revenue: 50 }, { customerId: 'c2', revenue: 50 }];
  
  const paramsBefore = {
    monthlyRevenue,
    invoices: invoicesBase, // 100% on time
    monthlyNetCashFlow,
    transactions,
    customerRevenues,
    today
  };
  
  const resBefore = creditScore(paramsBefore);
  
  // Add a very late invoice to drastically change payment behaviour
  const invoicesAfter: Invoice[] = [
    ...invoicesBase,
    { id: '2', amount: 100, issueDate: new Date('2026-02-01T00:00:00Z'), dueDate: new Date('2026-02-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-04-15T00:00:00Z'), paidAmount: 100 } // 59 days late
  ];
  
  const paramsAfter = {
    monthlyRevenue,
    invoices: invoicesAfter,
    monthlyNetCashFlow,
    transactions,
    customerRevenues,
    today
  };
  
  const resAfter = creditScore(paramsAfter);
  const getSubscore = (res: any, name: string) => res.detailedFactors.find((f: any) => f.name === name).subScore;
  
  // ASSERT ONLY Payment Behaviour changed
  expect(getSubscore(resBefore, 'Payment Behaviour')).not.toBe(getSubscore(resAfter, 'Payment Behaviour'));
  expect(getSubscore(resBefore, 'Payment Behaviour')).toBeGreaterThan(getSubscore(resAfter, 'Payment Behaviour'));
});

test('creditScore - changing ONLY payment behaviour via late paidDate changes ONLY payment behaviour subscore', () => {
  const today = new Date('2026-06-01T00:00:00Z');
  
  const invoice1: Invoice = { id: '1', amount: 100, issueDate: new Date('2026-01-01T00:00:00Z'), dueDate: new Date('2026-01-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-01-14T00:00:00Z'), paidAmount: 100 };
  const invoice2: Invoice = { id: '2', amount: 100, issueDate: new Date('2026-02-01T00:00:00Z'), dueDate: new Date('2026-02-15T00:00:00Z'), status: 'PAID', paidDate: new Date('2026-02-14T00:00:00Z'), paidAmount: 100 };
  
  const paramsBefore = {
    monthlyRevenue: [1000, 1000, 1000],
    invoices: [invoice1, invoice2],
    monthlyNetCashFlow: [200, 200, 200],
    transactions: [{ id: '1', amount: 100, type: 'INFLOW', date: new Date('2025-01-01T00:00:00Z') }],
    customerRevenues: [{ customerId: 'c1', revenue: 50 }, { customerId: 'c2', revenue: 50 }],
    today
  };
  
  const resBefore = creditScore(paramsBefore);
  
  // Now modify invoice2 to be late. Status is still PAID, so totalInvoices and paidInvoiceRatio are IDENTICAL.
  const invoice2Late: Invoice = { ...invoice2, paidDate: new Date('2026-04-15T00:00:00Z') }; // 59 days late
  
  const paramsAfter = {
    ...paramsBefore,
    invoices: [invoice1, invoice2Late]
  };
  
  const resAfter = creditScore(paramsAfter);
  const getSubscore = (res: any, name: string) => res.detailedFactors.find((f: any) => f.name === name).subScore;
  
  // Payment Behaviour should be different
  expect(getSubscore(resBefore, 'Payment Behaviour')).not.toBe(getSubscore(resAfter, 'Payment Behaviour'));
  expect(getSubscore(resBefore, 'Payment Behaviour')).toBeGreaterThan(getSubscore(resAfter, 'Payment Behaviour'));
  
  // The other 5 MUST be byte-identical
  expect(getSubscore(resBefore, 'Revenue Consistency')).toBe(getSubscore(resAfter, 'Revenue Consistency'));
  expect(getSubscore(resBefore, 'Cash-Flow Stability')).toBe(getSubscore(resAfter, 'Cash-Flow Stability'));
  expect(getSubscore(resBefore, 'Invoice History')).toBe(getSubscore(resAfter, 'Invoice History'));
  expect(getSubscore(resBefore, 'Business Continuity')).toBe(getSubscore(resAfter, 'Business Continuity'));
  expect(getSubscore(resBefore, 'Customer Concentration')).toBe(getSubscore(resAfter, 'Customer Concentration'));
});

test('creditScore - handles all-zero/empty inputs without crashing', () => {
  const paramsEmpty = {
    monthlyRevenue: [],
    invoices: [],
    monthlyNetCashFlow: [],
    transactions: [],
    customerRevenues: [],
    today: new Date()
  };
  const res = creditScore(paramsEmpty);
  expect(res.score).toBeGreaterThanOrEqual(0);
  expect(res.riskLevel).toBeDefined();
});
