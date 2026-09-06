export interface Transaction {
  id: string;
  amount: number;
  type: string; // 'INFLOW' | 'OUTFLOW'
  date: Date;
}

export interface Invoice {
  id: string;
  customerId?: string;
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

export interface InventoryItem {
  id: string;
  quantityOnHand: number;
  unitCost: number;
}
