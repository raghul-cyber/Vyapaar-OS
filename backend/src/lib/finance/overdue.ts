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
