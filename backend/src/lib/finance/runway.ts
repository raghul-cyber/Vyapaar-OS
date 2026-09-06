export function runwayDays(cashPosition: number, dailyBurnRate: number): number | string | null {
  if (dailyBurnRate <= 0) {
    return "365+ (stable)";
  }
  return cashPosition / dailyBurnRate;
}
