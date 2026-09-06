import { Expense } from './types';
import { mean, stdDev } from './mathUtils';

export interface AnomalyReason {
  mean: number;
  stdDev: number;
  threshold: number;
}

export interface AnomalousExpenseResult {
  expense: Expense;
  reason: AnomalyReason;
}

export function findAnomalousExpenses(expenses: Expense[]): AnomalousExpenseResult[] {
  const categoryMap = new Map<string, number[]>();
  
  for (const exp of expenses) {
    if (!categoryMap.has(exp.category)) {
      categoryMap.set(exp.category, []);
    }
    categoryMap.get(exp.category)!.push(exp.amount);
  }
  
  const anomalies: AnomalousExpenseResult[] = [];
  
  for (const exp of expenses) {
    const vals = categoryMap.get(exp.category)!;
    if (vals.length < 2) continue; // cannot have anomaly with 1 item reliably based on stddev
    
    const m = mean(vals);
    const sd = stdDev(vals);
    
    if (m !== null && sd !== null) {
      const threshold = m + 2 * sd;
      if (exp.amount > threshold) {
        anomalies.push({ 
          expense: exp, 
          reason: { mean: m, stdDev: sd, threshold } 
        });
      }
    }
  }
  
  return anomalies;
}
