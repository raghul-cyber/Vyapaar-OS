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
  drivers: {
    invoices: Invoice[];
    expenses: Expense[];
  };
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
  
  const projectedCash: number[] = [params.currentCash];
  const shortageAlerts: ShortageAlert[] = [];
  
  let current = params.currentCash;
  
  for (let d = 1; d <= days; d++) {
    const targetDate = new Date(params.today.getTime() + d * 24 * 60 * 60 * 1000);
    const targetDateString = targetDate.toISOString().split('T')[0];
    
    let scheduledInflowsD = 0;
    let scheduledOutflowsD = 0;
    
    const dayInvoices: Invoice[] = [];
    const dayExpenses: Expense[] = [];
    
    for (const inv of params.invoices) {
      if (inv.status !== 'PAID' && inv.dueDate.toISOString().split('T')[0] === targetDateString) {
        scheduledInflowsD += inv.amount;
        dayInvoices.push(inv);
      }
    }
    
    for (const exp of params.expenses) {
      if (exp.isRecurring && exp.date.toISOString().split('T')[0] === targetDateString) {
        scheduledOutflowsD += exp.amount;
        dayExpenses.push(exp);
      }
    }
    
    const inflow = scheduledInflowsD > 0 ? scheduledInflowsD : scheduledInflowsD + recurringInflowEstimate;
    const outflow = scheduledOutflowsD > 0 ? scheduledOutflowsD : scheduledOutflowsD + recurringOutflowEstimate;
    
    current = current + inflow - outflow;
    projectedCash.push(current);
    
    if (current < 0) {
      shortageAlerts.push({ 
        day: d, 
        amount: current,
        drivers: {
          invoices: dayInvoices,
          expenses: dayExpenses
        }
      });
    }
  }
  
  return {
    projectedCash,
    shortageAlerts
  };
}
