const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'lib', 'finance');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const files = {};

files['types.ts'] = `
export interface Transaction {
  id: string;
  amount: number;
  type: string; // 'INFLOW' | 'OUTFLOW'
  date: Date;
}

export interface Invoice {
  id: string;
  amount: number;
  issueDate: Date;
  dueDate: Date;
  status: string; // 'PAID' | 'UNPAID' | 'PARTIAL'
  paidDate: Date | null;
  paidAmount: number | null;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  date: Date;
  isRecurring: boolean;
}
`;

files['mathUtils.ts'] = `
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

export function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((a, b) => a + Math.pow(b - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}
`;

files['cashPosition.ts'] = `
import { Transaction } from './types';

export function cashPosition(transactions: Transaction[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.type === 'INFLOW') return acc + tx.amount;
    if (tx.type === 'OUTFLOW') return acc - tx.amount;
    return acc;
  }, 0);
}
`;

files['cashPosition.test.ts'] = `
import { expect, test } from 'vitest';
import { cashPosition } from './cashPosition';

test('cashPosition calculates correctly', () => {
  const txs = [
    { id: '1', amount: 1000, type: 'INFLOW', date: new Date() },
    { id: '2', amount: 300, type: 'OUTFLOW', date: new Date() }
  ];
  expect(cashPosition(txs)).toBe(700);
});
`;

files['burnRate.ts'] = `
import { Transaction } from './types';

export function dailyBurnRate(transactions: Transaction[], asOfDate: Date): number {
  const thirtyDaysAgo = new Date(asOfDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  let inflow = 0;
  let outflow = 0;
  
  for (const tx of transactions) {
    if (tx.date >= thirtyDaysAgo && tx.date <= asOfDate) {
      if (tx.type === 'INFLOW') inflow += tx.amount;
      if (tx.type === 'OUTFLOW') outflow += tx.amount;
    }
  }
  
  return (outflow - inflow) / 30;
}
`;

files['burnRate.test.ts'] = `
import { expect, test } from 'vitest';
import { dailyBurnRate } from './burnRate';

test('dailyBurnRate calculates correctly', () => {
  const now = new Date('2026-01-31T00:00:00Z');
  const txs = [
    { id: '1', amount: 900, type: 'OUTFLOW', date: new Date('2026-01-15T00:00:00Z') },
    { id: '2', amount: 300, type: 'INFLOW', date: new Date('2026-01-20T00:00:00Z') }
  ];
  // (900 - 300) / 30 = 20
  expect(dailyBurnRate(txs, now)).toBe(20);
});
`;

files['runway.ts'] = `
export function runwayDays(cashPosition: number, dailyBurnRate: number): number | string | null {
  if (dailyBurnRate <= 0) {
    return "365+ (stable)";
  }
  return cashPosition / dailyBurnRate;
}
`;

files['runway.test.ts'] = `
import { expect, test } from 'vitest';
import { runwayDays } from './runway';

test('runwayDays calculates correctly', () => {
  expect(runwayDays(1000, 10)).toBe(100);
});

test('runwayDays handles zero or negative burn rate (divide by zero guard)', () => {
  expect(runwayDays(1000, 0)).toBe("365+ (stable)");
  expect(runwayDays(1000, -50)).toBe("365+ (stable)");
});
`;

files['overdue.ts'] = `
import { Invoice } from './types';

export interface OverdueInvoice extends Invoice {
  daysOverdue: number;
}

export function overdueInvoices(invoices: Invoice[], today: Date): OverdueInvoice[] {
  const overdue: OverdueInvoice[] = [];
  
  for (const inv of invoices) {
    if (inv.status !== 'PAID' && inv.dueDate < today) {
      const msDiff = today.getTime() - inv.dueDate.getTime();
      const daysOverdue = Math.floor(msDiff / (1000 * 60 * 60 * 24));
      overdue.push({ ...inv, daysOverdue });
    }
  }
  
  return overdue;
}
`;

files['overdue.test.ts'] = `
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
`;

files['revenueConsistency.ts'] = `
import { stdDev, mean } from './mathUtils';

export function revenueConsistency(monthlyRevenue: number[]): number | null {
  const m = mean(monthlyRevenue);
  if (m === null || m === 0) return null;
  const sd = stdDev(monthlyRevenue);
  if (sd === null) return null;
  return sd / m;
}
`;

files['revenueConsistency.test.ts'] = `
import { expect, test } from 'vitest';
import { revenueConsistency } from './revenueConsistency';

test('revenueConsistency calculates CV correctly', () => {
  // mean = 100, stdDev = 0 -> CV = 0
  expect(revenueConsistency([100, 100, 100])).toBe(0);
});

test('revenueConsistency handles divide by zero (mean is 0)', () => {
  expect(revenueConsistency([0, 0, 0])).toBeNull();
  expect(revenueConsistency([])).toBeNull();
});
`;

files['paymentBehaviour.ts'] = `
import { Invoice } from './types';
import { mean } from './mathUtils';

export function paymentBehaviour(invoices: Invoice[]): { onTimeRatio: number | null, avgDaysLate: number | null } {
  const paidInvoices = invoices.filter(inv => inv.status === 'PAID' && inv.paidDate);
  
  if (paidInvoices.length === 0) {
    return { onTimeRatio: null, avgDaysLate: null };
  }
  
  let onTimeCount = 0;
  const lateDays: number[] = [];
  
  for (const inv of paidInvoices) {
    if (inv.paidDate! <= inv.dueDate) {
      onTimeCount++;
    } else {
      const msDiff = inv.paidDate!.getTime() - inv.dueDate.getTime();
      const days = Math.max(0, msDiff / (1000 * 60 * 60 * 24));
      lateDays.push(days);
    }
  }
  
  const onTimeRatio = onTimeCount / paidInvoices.length;
  const avgDaysLate = lateDays.length > 0 ? mean(lateDays) : null;
  
  return { onTimeRatio, avgDaysLate };
}
`;

files['paymentBehaviour.test.ts'] = `
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
`;

files['cashFlowStability.ts'] = `
import { stdDev, mean } from './mathUtils';

export function cashFlowStability(monthlyNetCashFlow: number[]): number | null {
  const m = mean(monthlyNetCashFlow);
  if (m === null || m === 0) return null;
  const sd = stdDev(monthlyNetCashFlow);
  if (sd === null) return null;
  return sd / m;
}
`;

files['cashFlowStability.test.ts'] = `
import { expect, test } from 'vitest';
import { cashFlowStability } from './cashFlowStability';

test('cashFlowStability handles divide by zero', () => {
  expect(cashFlowStability([0, 0, 0])).toBeNull();
  expect(cashFlowStability([])).toBeNull();
});

test('cashFlowStability calculates CV', () => {
  expect(cashFlowStability([100, 100])).toBe(0);
});
`;

files['businessContinuity.ts'] = `
import { Transaction } from './types';

export function monthsActive(transactions: Transaction[], today: Date): number {
  if (transactions.length === 0) return 0;
  
  let firstDate = transactions[0].date;
  for (const tx of transactions) {
    if (tx.date < firstDate) firstDate = tx.date;
  }
  
  const msDiff = today.getTime() - firstDate.getTime();
  return msDiff / (1000 * 60 * 60 * 24 * 30.44); // approx months
}
`;

files['businessContinuity.test.ts'] = `
import { expect, test } from 'vitest';
import { monthsActive } from './businessContinuity';
import { Transaction } from './types';

test('monthsActive calculates correctly', () => {
  const today = new Date('2026-04-01T00:00:00Z');
  const txs: Transaction[] = [
    { id: '1', amount: 100, type: 'INFLOW', date: new Date('2026-01-01T00:00:00Z') }
  ];
  const months = monthsActive(txs, today);
  expect(months).toBeCloseTo(90 / 30.44, 1);
});
`;

files['customerConcentration.ts'] = `
export interface CustomerRevenue {
  customerId: string;
  revenue: number;
}

export function customerConcentration(revenues: CustomerRevenue[]): number | null {
  if (revenues.length === 0) return null;
  let total = 0;
  let maxRev = 0;
  
  for (const r of revenues) {
    total += r.revenue;
    if (r.revenue > maxRev) {
      maxRev = r.revenue;
    }
  }
  
  if (total === 0) return null;
  return maxRev / total;
}
`;

files['customerConcentration.test.ts'] = `
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
`;

files['anomalousExpense.ts'] = `
import { Expense } from './types';
import { mean, stdDev } from './mathUtils';

export function findAnomalousExpenses(expenses: Expense[]): Expense[] {
  const categoryMap = new Map<string, number[]>();
  
  for (const exp of expenses) {
    if (!categoryMap.has(exp.category)) {
      categoryMap.set(exp.category, []);
    }
    categoryMap.get(exp.category)!.push(exp.amount);
  }
  
  const anomalies: Expense[] = [];
  
  for (const exp of expenses) {
    const vals = categoryMap.get(exp.category)!;
    if (vals.length < 2) continue; // cannot have anomaly with 1 item reliably based on stddev
    
    const m = mean(vals);
    const sd = stdDev(vals);
    
    if (m !== null && sd !== null) {
      const threshold = m + 2 * sd;
      if (exp.amount > threshold) {
        anomalies.push(exp);
      }
    }
  }
  
  return anomalies;
}
`;

files['anomalousExpense.test.ts'] = `
import { expect, test } from 'vitest';
import { findAnomalousExpenses } from './anomalousExpense';
import { Expense } from './types';

test('findAnomalousExpenses flags correctly', () => {
  const exps: Expense[] = [
    { id: '1', category: 'Software', amount: 100, date: new Date(), isRecurring: false },
    { id: '2', category: 'Software', amount: 105, date: new Date(), isRecurring: false },
    { id: '3', category: 'Software', amount: 95, date: new Date(), isRecurring: false },
    { id: '4', category: 'Software', amount: 1000, date: new Date(), isRecurring: false } // Anomaly
  ];
  
  const anomalies = findAnomalousExpenses(exps);
  expect(anomalies).toHaveLength(1);
  expect(anomalies[0].id).toBe('4');
});
`;

files['forecast.ts'] = `
import { Invoice, Expense, Transaction } from './types';

export interface ForecastParams {
  currentCash: number;
  invoices: Invoice[];
  expenses: Expense[];
  transactions: Transaction[]; // trailing 90 days
  today: Date;
}

export interface ShortageAlert {
  day: number; // 1 to N
  amount: number;
}

export interface ForecastResult {
  projectedCash: number[];
  shortageAlerts: ShortageAlert[];
}

export function forecast(params: ForecastParams, days: number = 90): ForecastResult {
  let unscheduledInflow = 0;
  let unscheduledOutflow = 0;
  
  for (const tx of params.transactions) {
    // Basic heuristic: if it's not tied to an invoice/expense (we just assume all in tx list are unscheduled for this simplified calculation, or we'd need source/related fields)
    if (tx.type === 'INFLOW') unscheduledInflow += tx.amount;
    if (tx.type === 'OUTFLOW') unscheduledOutflow += tx.amount;
  }
  
  const recurringInflowEstimate = unscheduledInflow / 90;
  const recurringOutflowEstimate = unscheduledOutflow / 90;
  
  const projectedCash: number[] = [];
  const shortageAlerts: ShortageAlert[] = [];
  
  let current = params.currentCash;
  
  for (let d = 1; d <= days; d++) {
    const targetDate = new Date(params.today.getTime() + d * 24 * 60 * 60 * 1000);
    const targetDateString = targetDate.toISOString().split('T')[0];
    
    let scheduledInflowsD = 0;
    let scheduledOutflowsD = 0;
    
    for (const inv of params.invoices) {
      if (inv.status !== 'PAID' && inv.dueDate.toISOString().split('T')[0] === targetDateString) {
        scheduledInflowsD += inv.amount;
      }
    }
    
    for (const exp of params.expenses) {
      if (exp.isRecurring && exp.date.toISOString().split('T')[0] === targetDateString) {
        scheduledOutflowsD += exp.amount;
      }
    }
    
    const inflow = scheduledInflowsD > 0 ? scheduledInflowsD : scheduledInflowsD + recurringInflowEstimate;
    const outflow = scheduledOutflowsD > 0 ? scheduledOutflowsD : scheduledOutflowsD + recurringOutflowEstimate;
    
    current = current + inflow - outflow;
    projectedCash.push(current);
    
    if (current < 0) {
      shortageAlerts.push({ day: d, amount: current });
    }
  }
  
  return { projectedCash, shortageAlerts };
}
`;

files['forecast.test.ts'] = `
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
  
  expect(res.projectedCash[1]).toBe(-1000);
  expect(res.shortageAlerts.length).toBeGreaterThan(0);
  expect(res.shortageAlerts[0].day).toBe(2);
});
`;

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, filename), content.trim() + '\n');
}
console.log('Successfully created all finance functions and tests.');
