import { Invoice, Expense, Transaction, InventoryItem } from './types';
import { forecast } from './forecast';
import { overdueInvoices } from './overdue';

export interface WhatIfParams {
  currentCash: number;
  invoices: Invoice[];
  expenses: Expense[];
  transactions: Transaction[];
  inventory: InventoryItem[];
  today: Date;
  customerId?: string;
  delayDays?: number;
}

export interface Recommendation {
  action: string;
  amount: number;
  sourceRecordIds: string[];
}

export interface WhatIfResult {
  targetCustomerId: string;
  baselineRunway: number;
  scenarioRunway: number;
  runwayDropPct: number;
  riskLevel: string;
  cashImpact: number;
  recommendations: Recommendation[];
}

function getRunway(forecastRes: { projectedCash: number[], shortageAlerts: { day: number }[] }): number {
  if (forecastRes.shortageAlerts.length > 0) {
    return forecastRes.shortageAlerts[0].day;
  }
  return 90;
}

export function whatIf(params: WhatIfParams): WhatIfResult {
  const { currentCash, invoices, expenses, transactions, inventory, today } = params;
  const delayDays = params.delayDays || 30;
  let targetCustomerId = params.customerId || '';
  
  const customerTrailingRev = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.customerId && inv.status === 'PAID' && inv.paidDate) {
      const msDiff = today.getTime() - inv.paidDate.getTime();
      const daysSincePaid = msDiff / (1000 * 60 * 60 * 24);
      if (daysSincePaid <= 90 && daysSincePaid >= 0) {
        const rev = customerTrailingRev.get(inv.customerId) || 0;
        customerTrailingRev.set(inv.customerId, rev + (inv.paidAmount || inv.amount));
      }
    }
  }
  
  if (!targetCustomerId) {
    const customerUnpaid = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.customerId && inv.status !== 'PAID') {
        const amt = customerUnpaid.get(inv.customerId) || 0;
        customerUnpaid.set(inv.customerId, amt + inv.amount);
      }
    }
    
    let maxScore = -1;
    let bestCustomer = '';
    const customerIds = new Set([...customerUnpaid.keys(), ...customerTrailingRev.keys()]);
    
    for (const cid of customerIds) {
      const unpaid = customerUnpaid.get(cid) || 0;
      const rev = customerTrailingRev.get(cid) || 0;
      const expected = (rev / 90) * 30;
      const score = unpaid + expected;
      
      if (score > maxScore) {
        maxScore = score;
        bestCustomer = cid;
      } else if (score === maxScore) {
        const currentBestRev = customerTrailingRev.get(bestCustomer) || 0;
        if (rev > currentBestRev) {
          bestCustomer = cid;
        }
      }
    }
    targetCustomerId = bestCustomer;
  }
  
  const baselineParams = { currentCash, invoices, expenses, transactions, today };
  const baseline = forecast(baselineParams, 90);
  
  const perturbedInvoices: Invoice[] = [];
  let cashImpact = 0;
  
  for (const inv of invoices) {
    if (inv.customerId === targetCustomerId && inv.status !== 'PAID') {
      const msDiff = inv.dueDate.getTime() - today.getTime();
      const daysFromNow = Math.floor(msDiff / 86400000);
      
      if (daysFromNow >= 0 && daysFromNow <= delayDays) {
        cashImpact += inv.amount;
        const newDueDate = new Date(inv.dueDate.getTime() + delayDays * 86400000);
        perturbedInvoices.push({ ...inv, dueDate: newDueDate });
        continue;
      }
    }
    perturbedInvoices.push(inv);
  }
  
  const perturbedParams = { currentCash, invoices: perturbedInvoices, expenses, transactions, today };
  const scenario = forecast(perturbedParams, 90);
  
  const currentRunway = getRunway(baseline);
  const scenarioRunway = getRunway(scenario);
  
  let runwayDropPct = 0;
  if (currentRunway > 0) {
    runwayDropPct = (currentRunway - scenarioRunway) / currentRunway;
  }
  
  let riskLevel = 'LOW';
  if (runwayDropPct >= 0.40) riskLevel = 'HIGH';
  else if (runwayDropPct >= 0.15) riskLevel = 'MEDIUM';
  
  const allRecs: Recommendation[] = [];
  
  const overdue = overdueInvoices(invoices, today).filter(i => i.customerId !== targetCustomerId);
  if (overdue.length > 0) {
    let amt = 0;
    const ids: string[] = [];
    for (const o of overdue) {
      amt += o.amount;
      ids.push(o.id);
    }
    allRecs.push({ action: 'Collect overdue invoices', amount: amt, sourceRecordIds: ids });
  }
  
  const discretionary = expenses.filter(e => !e.isRecurring && !['rent', 'salaries', 'utilities'].includes(e.category.toLowerCase()));
  if (discretionary.length > 0) {
    let amt = 0;
    const ids: string[] = [];
    for (const e of discretionary) {
      amt += e.amount;
      ids.push(e.id);
    }
    allRecs.push({ action: 'Defer discretionary expenses', amount: amt, sourceRecordIds: ids });
  }
  
  if (inventory && inventory.length > 0) {
    const overstock = inventory.filter(i => i.quantityOnHand * i.unitCost > 0);
    if (overstock.length > 0) {
      let amt = 0;
      const ids: string[] = [];
      for (const i of overstock) {
        amt += i.quantityOnHand * i.unitCost;
        ids.push(i.id);
      }
      allRecs.push({ action: 'Reduce inventory', amount: amt, sourceRecordIds: ids });
    }
  }
  
  allRecs.sort((a, b) => b.amount - a.amount);
  
  const recommendations: Recommendation[] = [];
  let needed = cashImpact;
  
  for (const rec of allRecs) {
    if (needed <= 0) break;
    const appliedAmount = Math.min(rec.amount, needed);
    recommendations.push({ action: rec.action, amount: appliedAmount, sourceRecordIds: rec.sourceRecordIds });
    needed -= appliedAmount;
  }
  
  return {
    targetCustomerId,
    baselineRunway: currentRunway,
    scenarioRunway,
    runwayDropPct,
    riskLevel,
    cashImpact,
    recommendations
  };
}
