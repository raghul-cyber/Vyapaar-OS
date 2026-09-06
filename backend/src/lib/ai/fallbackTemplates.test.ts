import { describe, it, expect } from 'vitest';
import { fallbackNarrative } from './fallbackTemplates';

describe('fallbackTemplates', () => {
  it('returns high risk narrative when score is low', () => {
    const res = fallbackNarrative('creditScore', { score: 30, riskLevel: 'Very High Risk' });
    expect(res).toContain('Very High Risk');
  });

  it('returns low risk narrative when score is high', () => {
    const res = fallbackNarrative('creditScore', { score: 85, riskLevel: 'Low Risk' });
    expect(res).toContain('Low Risk');
  });

  it('includes specific alerts when provided', () => {
    const res = fallbackNarrative('dashboard', { cashPosition: 1000, runway: 30 });
    expect(res).toContain('cash position is 1000');
  });
});
