const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'lib', 'finance');

const files = {};

files['creditScore.ts'] = `
import { Invoice, Transaction } from './types';
import { revenueConsistency } from './revenueConsistency';
import { paymentBehaviour } from './paymentBehaviour';
import { cashFlowStability } from './cashFlowStability';
import { monthsActive } from './businessContinuity';
import { customerConcentration, CustomerRevenue } from './customerConcentration';

export interface CreditScoreParams {
  monthlyRevenue: number[];
  invoices: Invoice[];
  monthlyNetCashFlow: number[];
  transactions: Transaction[];
  customerRevenues: CustomerRevenue[];
  today: Date;
}

export interface Factor {
  name: string;
  subScore: number;
}

export interface CreditScoreResult {
  score: number;
  riskLevel: string;
  positiveFactors: Factor[];
  negativeFactors: Factor[];
  explanation: string;
  _debugSubScores: Record<string, number>; // for testing purposes
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function calculateSubScores(params: CreditScoreParams): Record<string, number> {
  const cvRev = revenueConsistency(params.monthlyRevenue);
  const revConsScore = clamp(100 - (cvRev ?? 1) * 100);
  
  const pb = paymentBehaviour(params.invoices);
  const pbScore = clamp(((pb.onTimeRatio ?? 0) * 100) - Math.min(30, (pb.avgDaysLate ?? 0) * 1.5));
  
  const cvCf = cashFlowStability(params.monthlyNetCashFlow);
  const cfStabScore = clamp(100 - (cvCf ?? 1) * 100);
  
  const totalInvoices = params.invoices.length;
  const paidInvoices = params.invoices.filter(i => i.status === 'PAID').length;
  const paidInvoiceRatio = totalInvoices > 0 ? paidInvoices / totalInvoices : 0;
  const invHistScore = clamp((totalInvoices / 30) * 50 + (paidInvoiceRatio * 50));
  
  const activeMonths = monthsActive(params.transactions, params.today);
  const bcScore = clamp((activeMonths / 24) * 100);
  
  const topCust = customerConcentration(params.customerRevenues);
  const ccScore = clamp(100 - (topCust ?? 1) * 100);
  
  return {
    'Revenue Consistency': revConsScore,
    'Payment Behaviour': pbScore,
    'Cash-Flow Stability': cfStabScore,
    'Invoice History': invHistScore,
    'Business Continuity': bcScore,
    'Customer Concentration': ccScore
  };
}

export function creditScore(params: CreditScoreParams): CreditScoreResult {
  const subScores = calculateSubScores(params);
  
  const weights: Record<string, number> = {
    'Revenue Consistency': 0.20,
    'Payment Behaviour': 0.20,
    'Cash-Flow Stability': 0.20,
    'Invoice History': 0.15,
    'Business Continuity': 0.15,
    'Customer Concentration': 0.10
  };
  
  let totalScore = 0;
  const contributions = [];
  
  for (const name in weights) {
    const subScore = subScores[name];
    const weight = weights[name];
    const contribution = subScore * weight;
    totalScore += contribution;
    
    contributions.push({ name, subScore, contribution });
  }
  
  const score = clamp(Math.round(totalScore));
  
  let riskLevel = '';
  if (score >= 80) riskLevel = 'Low Risk';
  else if (score >= 60) riskLevel = 'Moderate Risk';
  else if (score >= 40) riskLevel = 'High Risk';
  else riskLevel = 'Very High Risk';
  
  contributions.sort((a, b) => b.contribution - a.contribution);
  
  const positiveFactors = [
    { name: contributions[0].name, subScore: Math.round(contributions[0].subScore) },
    { name: contributions[1].name, subScore: Math.round(contributions[1].subScore) }
  ];
  
  const negativeFactors = [
    { name: contributions[contributions.length - 1].name, subScore: Math.round(contributions[contributions.length - 1].subScore) },
    { name: contributions[contributions.length - 2].name, subScore: Math.round(contributions[contributions.length - 2].subScore) }
  ];
  
  const explanation = \`Score driven up by \${positiveFactors[0].name} (\${positiveFactors[0].subScore}/100); held back by \${negativeFactors[0].name} (\${negativeFactors[0].subScore}/100).\`;
  
  return {
    score,
    riskLevel,
    positiveFactors,
    negativeFactors,
    explanation,
    _debugSubScores: subScores
  };
}
`;

files['creditScore.test.ts'] = `
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
  const scoresBefore = resBefore._debugSubScores;
  
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
  const scoresAfter = resAfter._debugSubScores;
  
  // ASSERT ONLY Payment Behaviour changed
  expect(scoresBefore['Payment Behaviour']).not.toBe(scoresAfter['Payment Behaviour']);
  expect(scoresBefore['Payment Behaviour']).toBeGreaterThan(scoresAfter['Payment Behaviour']);
  
  // Invoice History score changes when invoices change (because totalInvoices changes and paidInvoiceRatio might change)
  // WAIT: The prompt said "changes ONLY the Payment Behaviour input... asserts that ONLY the Payment Behaviour sub-score changes — all five other sub-scores must be byte-identical before/after."
  // But if I add an invoice to invoices[], it also changes Invoice History! (totalInvoices/30).
  // So to change ONLY payment behaviour without changing invoice history, I must KEEP totalInvoices and paidInvoiceRatio exactly the same.
  // I will just modify the paidDate of an existing paid invoice to make it late, rather than adding a new invoice!
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
  
  const before = resBefore._debugSubScores;
  const after = resAfter._debugSubScores;
  
  // Payment Behaviour should be different
  expect(before['Payment Behaviour']).not.toBe(after['Payment Behaviour']);
  expect(before['Payment Behaviour']).toBeGreaterThan(after['Payment Behaviour']);
  
  // The other 5 MUST be byte-identical
  expect(before['Revenue Consistency']).toBe(after['Revenue Consistency']);
  expect(before['Cash-Flow Stability']).toBe(after['Cash-Flow Stability']);
  expect(before['Invoice History']).toBe(after['Invoice History']);
  expect(before['Business Continuity']).toBe(after['Business Continuity']);
  expect(before['Customer Concentration']).toBe(after['Customer Concentration']);
});
`;

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, filename), content.trim() + '\n');
}
console.log('Successfully created creditScore.ts and its test.');
