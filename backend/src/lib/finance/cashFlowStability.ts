import { stdDev, mean } from './mathUtils';

export function cashFlowStability(monthlyNetCashFlow: number[]): number | null {
  const m = mean(monthlyNetCashFlow);
  if (m === null || m === 0) return null;
  const sd = stdDev(monthlyNetCashFlow);
  if (sd === null) return null;
  return sd / m;
}
