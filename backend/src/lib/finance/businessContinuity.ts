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
