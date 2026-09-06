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
