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
