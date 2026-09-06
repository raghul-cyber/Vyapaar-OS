import { Invoice, Transaction } from './types';
import { revenueConsistency } from './revenueConsistency';
import { paymentBehaviour } from './paymentBehaviour';
import { cashFlowStability } from './cashFlowStability';
import { monthsActive } from './businessContinuity';
import { customerConcentration, CustomerRevenue } from './customerConcentration';

export interface CreditScoreParams {
  monthlyRevenue: number[];
  invoices: Invoice[];
  monthlyNetCashFlow: number[];
  transactions: Transaction[];
  customerRevenues: CustomerRevenue[];
  today: Date;
}

export interface Factor {
  name: string;
  subScore: number;
}

export interface DetailedFactor extends Factor {
  formula: string;
  inputs: Record<string, any>;
}

export interface CreditScoreResult {
  score: number;
  riskLevel: string;
  positiveFactors: Factor[];
  negativeFactors: Factor[];
  explanation: string;
  detailedFactors: DetailedFactor[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function calculateSubScores(params: CreditScoreParams): DetailedFactor[] {
  const cvRev = revenueConsistency(params.monthlyRevenue);
  const revConsScore = clamp(100 - (cvRev ?? 1) * 100);
  
  const pb = paymentBehaviour(params.invoices);
  const pbScore = clamp(((pb.onTimeRatio ?? 0) * 100) - Math.min(30, (pb.avgDaysLate ?? 0) * 1.5));
  
  const cvCf = cashFlowStability(params.monthlyNetCashFlow);
  const cfStabScore = clamp(100 - (cvCf ?? 1) * 100);
  
  const totalInvoices = params.invoices.length;
  const paidInvoices = params.invoices.filter(i => i.status === 'PAID').length;
  const paidInvoiceRatio = totalInvoices > 0 ? paidInvoices / totalInvoices : 0;
  const invHistScore = clamp((totalInvoices / 30) * 50 + (paidInvoiceRatio * 50));
  
  const activeMonths = monthsActive(params.transactions, params.today);
  const bcScore = clamp((activeMonths / 24) * 100);
  
  const topCust = customerConcentration(params.customerRevenues);
  const ccScore = clamp(100 - (topCust ?? 1) * 100);
  
  return [
    {
      name: 'Revenue Consistency',
      subScore: revConsScore,
      formula: '100 - (CoefficientOfVariation(MonthlyRevenue) * 100)',
      inputs: { cvRev: cvRev ?? 1 }
    },
    {
      name: 'Payment Behaviour',
      subScore: pbScore,
      formula: '(OnTimeRatio * 100) - min(30, AvgDaysLate * 1.5)',
      inputs: { onTimeRatio: pb.onTimeRatio, avgDaysLate: pb.avgDaysLate }
    },
    {
      name: 'Cash-Flow Stability',
      subScore: cfStabScore,
      formula: '100 - (CoefficientOfVariation(MonthlyNetCashFlow) * 100)',
      inputs: { cvCf: cvCf ?? 1 }
    },
    {
      name: 'Invoice History',
      subScore: invHistScore,
      formula: '(TotalInvoices / 30) * 50 + (PaidInvoiceRatio * 50)',
      inputs: { totalInvoices, paidInvoices, paidInvoiceRatio }
    },
    {
      name: 'Business Continuity',
      subScore: bcScore,
      formula: '(MonthsActive / 24) * 100',
      inputs: { activeMonths }
    },
    {
      name: 'Customer Concentration',
      subScore: ccScore,
      formula: '100 - (Max(CustomerRevenue) / TotalRevenue * 100)',
      inputs: { topCustRatio: topCust ?? 1 }
    }
  ];
}

export function creditScore(params: CreditScoreParams): CreditScoreResult {
  const detailedFactors = calculateSubScores(params);
  
  const weights: Record<string, number> = {
    'Revenue Consistency': 0.20,
    'Payment Behaviour': 0.20,
    'Cash-Flow Stability': 0.20,
    'Invoice History': 0.15,
    'Business Continuity': 0.15,
    'Customer Concentration': 0.10
  };
  
  let totalScore = 0;
  const contributions = [];
  
  for (const factor of detailedFactors) {
    const weight = weights[factor.name];
    const contribution = factor.subScore * weight;
    totalScore += contribution;
    
    contributions.push({ name: factor.name, subScore: factor.subScore, contribution });
  }
  
  const score = clamp(Math.round(totalScore));
  
  let riskLevel = '';
  if (score >= 80) riskLevel = 'Low Risk';
  else if (score >= 60) riskLevel = 'Moderate Risk';
  else if (score >= 40) riskLevel = 'High Risk';
  else riskLevel = 'Very High Risk';
  
  contributions.sort((a, b) => b.contribution - a.contribution);
  
  const positiveFactors = [
    { name: contributions[0].name, subScore: Math.round(contributions[0].subScore) },
    { name: contributions[1].name, subScore: Math.round(contributions[1].subScore) }
  ];
  
  const negativeFactors = [
    { name: contributions[contributions.length - 1].name, subScore: Math.round(contributions[contributions.length - 1].subScore) },
    { name: contributions[contributions.length - 2].name, subScore: Math.round(contributions[contributions.length - 2].subScore) }
  ];
  
  const explanation = `Score driven up by ${positiveFactors[0].name} (${positiveFactors[0].subScore}/100); held back by ${negativeFactors[0].name} (${negativeFactors[0].subScore}/100).`;
  
  return {
    score,
    riskLevel,
    positiveFactors,
    negativeFactors,
    explanation,
    detailedFactors
  };
}
