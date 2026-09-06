import { stdDev, mean } from './mathUtils';

export function revenueConsistency(monthlyRevenue: number[]): number | null {
  const m = mean(monthlyRevenue);
  if (m === null || m === 0) return null;
  const sd = stdDev(monthlyRevenue);
  if (sd === null) return null;
  return sd / m;
}
