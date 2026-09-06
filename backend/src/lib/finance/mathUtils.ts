export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

export function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((a, b) => a + Math.pow(b - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}
