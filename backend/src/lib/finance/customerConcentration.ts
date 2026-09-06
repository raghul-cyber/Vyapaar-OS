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
