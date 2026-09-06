import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import prisma from './lib/db';
import { cashPosition } from './lib/finance/cashPosition';
import { runwayDays } from './lib/finance/runway';
import { dailyBurnRate } from './lib/finance/burnRate';
import { forecast } from './lib/finance/forecast';
import { overdueInvoices } from './lib/finance/overdue';
import { creditScore } from './lib/finance/creditScore';
import { whatIf } from './lib/finance/whatIf';
import { findAnomalousExpenses } from './lib/finance/anomalousExpense';

export const app = express();

app.use(express.json());

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:8081'];
app.use(cors({ origin: allowedOrigins }));

// Error wrapper for async routes
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Auth Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/auth/login') return next();
  if (req.path === '/api/seed' && process.env.NODE_ENV !== 'production') return next();
  
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
});

// GET /api/dashboard
app.get('/api/dashboard', asyncHandler(async (req: Request, res: Response) => {
  // In a real app, businessId comes from JWT
  const txs = await prisma.transaction.findMany({ orderBy: { date: 'desc' } });
  const invoices = await prisma.invoice.findMany();
  const expenses = await prisma.expense.findMany();
  
  const cp = cashPosition(txs);
  const br = dailyBurnRate(txs, new Date());
  const rw = runwayDays(cp, br);
  
  const cs = creditScore({
    transactions: txs,
    invoices: invoices.map((i: any) => ({ ...i, customerId: i.customerId, status: i.status })),
    expenses
  });
  
  const alerts = typeof rw === 'number' && rw < 30 ? ['Low runway detected!'] : [];
  
  const dashboardData = {
    cashPosition: cp,
    runway: rw,
    score: cs.score,
    alerts,
    recentTransactions: txs.slice(0, 10),
    trendData: [100, 120, 90, 150, 130, 180, 160], // Mock for UI phase
    insights: [
      { id: 1, title: 'Cash crunch likely in 45 days', description: 'Due to delayed invoices' },
      { id: 2, title: 'High concentration risk', description: 'One customer is 30% of revenue' }
    ]
  };
  
  const { generateNarrative } = await import('./lib/ai/llmClient');
  const { narrative, narrativeSource } = await generateNarrative('dashboard', dashboardData);
  
  res.json({
    ...dashboardData,
    narrative,
    narrativeSource
  });
}));

// GET /api/cashflow/forecast
const ForecastQuery = z.object({ days: z.enum(['30', '60', '90']).default('30') });
app.get('/api/cashflow/forecast', asyncHandler(async (req: Request, res: Response) => {
  const { days } = ForecastQuery.parse(req.query);
  
  const currentCash = cashPosition(await prisma.transaction.findMany());
  const invoices = await prisma.invoice.findMany();
  const expenses = await prisma.expense.findMany();
  const transactions = await prisma.transaction.findMany();
  
  const result = forecast({
    currentCash,
    invoices: invoices.map((i: any) => ({ ...i, customerId: i.customerId, status: i.status })),
    expenses,
    transactions,
    today: new Date()
  }, parseInt(days));
  
  res.json(result);
}));

// GET /api/invoices
const InvoiceQuery = z.object({
  status: z.string().optional(),
  customerId: z.string().optional(),
  overdue: z.string().optional(),
  search: z.string().optional()
});
app.get('/api/invoices', asyncHandler(async (req: Request, res: Response) => {
  const q = InvoiceQuery.parse(req.query);
  let where: any = {};
  if (q.status && q.status !== 'ALL') where.status = q.status;
  if (q.customerId) where.customerId = q.customerId;
  if (q.search) {
    where.customer = {
      name: { contains: q.search, mode: 'insensitive' }
    };
  }
  
  let invoices = await prisma.invoice.findMany({ 
    where,
    include: {
      customer: true,
      transactions: true
    },
    orderBy: { dueDate: 'asc' }
  });
  
  if (q.overdue === 'true') {
    // Reuse finance lib overdue logic
    invoices = overdueInvoices(invoices as any, new Date()) as any;
  }
  
  res.json(invoices);
}));

// GET /api/expenses
app.get('/api/expenses', asyncHandler(async (req: Request, res: Response) => {
  const expenses = await prisma.expense.findMany({ orderBy: { date: 'desc' } });
  const anomalies = findAnomalousExpenses(expenses);
  const anomalyMap = new Map(anomalies.map(a => [a.expense.id, a.reason]));
  
  const aggregates = expenses.reduce((acc: Record<string, number>, curr: any) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);
  
  res.json({
    expenses: expenses.map((e: any) => ({ 
      ...e, 
      isAnomaly: anomalyMap.has(e.id),
      anomalyReason: anomalyMap.get(e.id)
    })),
    aggregates,
    anomalies: anomalies.length
  });
}));

// GET /api/credit-score
app.get('/api/credit-score', asyncHandler(async (req: Request, res: Response) => {
  const invoices = await prisma.invoice.findMany({ include: { customer: true } });
  const transactions = await prisma.transaction.findMany();
  
  // Compute monthly revenue and net cash flow from transactions
  const monthlyData = new Map<string, { in: number, out: number }>();
  for (const t of transactions) {
    const monthKey = t.date.toISOString().substring(0, 7); // YYYY-MM
    if (!monthlyData.has(monthKey)) monthlyData.set(monthKey, { in: 0, out: 0 });
    
    const m = monthlyData.get(monthKey)!;
    if (t.type === 'INFLOW') m.in += t.amount;
    else m.out += t.amount;
  }
  
  // Sort chronologically and extract arrays
  const sortedMonths = Array.from(monthlyData.keys()).sort();
  const monthlyRevenue = sortedMonths.map(k => monthlyData.get(k)!.in);
  const monthlyNetCashFlow = sortedMonths.map(k => monthlyData.get(k)!.in - monthlyData.get(k)!.out);
  
  // Compute customer revenues from paid invoices
  const custRevMap = new Map<string, number>();
  for (const i of invoices) {
    if (i.status === 'PAID') {
      custRevMap.set(i.customerId, (custRevMap.get(i.customerId) || 0) + i.amount);
    }
  }
  const customerRevenues = Array.from(custRevMap.entries()).map(([customerId, revenue]) => ({ customerId, revenue }));
  
  const result = creditScore({
    monthlyRevenue,
    invoices: invoices as any,
    monthlyNetCashFlow,
    transactions,
    customerRevenues,
    today: new Date()
  });
  
  const { generateNarrative } = await import('./lib/ai/llmClient');
  const { narrative, narrativeSource } = await generateNarrative('creditScore', result);
  
  res.json({
    ...result,
    narrative,
    narrativeSource
  });
}));

// GET /api/insights
app.get('/api/insights', asyncHandler(async (req: Request, res: Response) => {
  const invoices = await prisma.invoice.findMany({ include: { customer: true } });
  const expenses = await prisma.expense.findMany();
  const transactions = await prisma.transaction.findMany();

  // Top Customers (by total paid invoice amount)
  const custMap = new Map<string, { id: string, name: string, total: number, count: number }>();
  let customersWithMultiInvoices = 0;
  let totalUniqueCustomersWithPaid = 0;

  for (const inv of invoices) {
    if (inv.status === 'PAID') {
      if (!custMap.has(inv.customerId)) {
        custMap.set(inv.customerId, { id: inv.customerId, name: inv.customer.name, total: 0, count: 0 });
      }
      const c = custMap.get(inv.customerId)!;
      c.total += inv.amount;
      c.count += 1;
    }
  }

  for (const c of custMap.values()) {
    totalUniqueCustomersWithPaid++;
    if (c.count > 1) customersWithMultiInvoices++;
  }

  const topCustomers = Array.from(custMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(c => ({ name: c.name, amount: c.total }));
    
  const repeatRate = totalUniqueCustomersWithPaid > 0 ? (customersWithMultiInvoices / totalUniqueCustomersWithPaid) * 100 : 0;

  // Best Categories
  const catMap = new Map<string, number>();
  for (const exp of expenses) {
    catMap.set(exp.category, (catMap.get(exp.category) || 0) + exp.amount);
  }
  const categories = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(c => ({ name: c[0], amount: c[1] }));

  // Trends
  const monthlyData = new Map<string, { revenue: number, spend: number }>();
  for (const t of transactions) {
    const monthKey = t.date.toISOString().substring(0, 7); // YYYY-MM
    if (!monthlyData.has(monthKey)) monthlyData.set(monthKey, { revenue: 0, spend: 0 });
    
    if (t.type === 'INFLOW') {
      monthlyData.get(monthKey)!.revenue += t.amount;
    } else {
      monthlyData.get(monthKey)!.spend += t.amount;
    }
  }
  
  const sortedMonths = Array.from(monthlyData.keys()).sort().slice(-6); // Last 6 months
  const trends = sortedMonths.map(month => ({
    month, // YYYY-MM
    revenue: monthlyData.get(month)!.revenue,
    spend: monthlyData.get(month)!.spend
  }));

  res.json({ topCustomers, categories, repeatRate, trends });
}));

// GET /api/customers
app.get('/api/customers', asyncHandler(async (req: Request, res: Response) => {
  const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
  res.json(customers);
}));

// POST /api/simulate/what-if
const WhatIfBody = z.object({
  customerId: z.string().optional(),
  delayDays: z.number().optional()
});
app.post('/api/simulate/what-if', asyncHandler(async (req: Request, res: Response) => {
  const body = WhatIfBody.parse(req.body);
  
  const currentCash = cashPosition(await prisma.transaction.findMany());
  const invoices = await prisma.invoice.findMany();
  const expenses = await prisma.expense.findMany();
  const transactions = await prisma.transaction.findMany();
  const inventory = await prisma.inventoryItem.findMany();
  
  const result = whatIf({
    currentCash,
    invoices: invoices as any,
    expenses,
    transactions,
    inventory,
    today: new Date(),
    customerId: body.customerId,
    delayDays: body.delayDays
  });
  
  const aiShape = {
    risk: result.riskLevel,
    currentRunwayDays: result.baselineRunway,
    scenarioRunwayDays: result.scenarioRunway,
    cashImpact: result.cashImpact,
    recommendations: result.recommendations.map(r => ({
      action: r.action,
      amount: r.amount,
      reason: `Based on ${r.sourceRecordIds.length} source records.`,
      sourceRecordIds: r.sourceRecordIds
    }))
  };

  const { generateNarrative } = await import('./lib/ai/llmClient');
  const { narrative, narrativeSource } = await generateNarrative('whatIf', aiShape);

  res.json({
    ...aiShape,
    narrative,
    narrativeSource
  });
}));

// POST /api/seed
app.post('/api/seed', asyncHandler(async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  }
  // Clear DB & Seed logic
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.business.deleteMany();
  
  res.json({ success: true, message: 'Database seeded' });
}));

// POST /api/import/csv
app.post('/api/import/csv', asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, parsed: 0 });
}));

// POST /api/auth/login
app.post('/api/auth/login', asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  
  const expectedUser = process.env.DEMO_USERNAME || 'demo';
  const expectedPass = process.env.DEMO_PASSWORD || 'demo';

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Invalid demo credentials', code: 'UNAUTHORIZED' });
  }

  const token = jwt.sign(
    { businessId: 'b1' }, 
    process.env.SESSION_SECRET || process.env.JWT_SECRET || 'dev-secret', 
    { expiresIn: '7d' }
  );
  res.json({ token });
}));
// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Validation Error', code: 'VALIDATION_ERROR', details: err.errors });
  }
  console.error(err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error', 
    code: err.code || 'INTERNAL_ERROR' 
  });
});
