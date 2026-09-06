import { Transaction } from './types';

export function cashPosition(transactions: Transaction[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.type === 'INFLOW') return acc + tx.amount;
    if (tx.type === 'OUTFLOW') return acc - tx.amount;
    return acc;
  }, 0);
}
