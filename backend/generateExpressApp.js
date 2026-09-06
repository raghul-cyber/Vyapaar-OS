const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, 'src');
if (!fs.existsSync(backendDir)) fs.mkdirSync(backendDir, { recursive: true });

const prismaDir = path.join(__dirname, 'prisma');
if (!fs.existsSync(prismaDir)) fs.mkdirSync(prismaDir, { recursive: true });

const files = {};

// 1. Create schema.prisma (SQLite)
files['../prisma/schema.prisma'] = `
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Business {
  id        String   @id @default(cuid())
  name      String
  industry  String
  createdAt DateTime @default(now())
  
  customers Customer[]
  suppliers Supplier[]
  categories ProductCategory[]
  invoices  Invoice[]
  transactions Transaction[]
  expenses  Expense[]
  inventory InventoryItem[]
}

model Customer {
  id         String   @id @default(cuid())
  businessId String
  name       String
  createdAt  DateTime @default(now())
  
  business   Business @relation(fields: [businessId], references: [id])
  invoices   Invoice[]

  @@index([businessId])
}

model Supplier {
  id         String   @id @default(cuid())
  businessId String
  name       String
  createdAt  DateTime @default(now())
  
  business   Business @relation(fields: [businessId], references: [id])
  expenses   Expense[]

  @@index([businessId])
}

model ProductCategory {
  id         String   @id @default(cuid())
  businessId String
  name       String
  
  business   Business @relation(fields: [businessId], references: [id])

  @@index([businessId])
}

model Invoice {
  id         String   @id @default(cuid())
  businessId String
  customerId String
  amount     Int
  issueDate  DateTime
  dueDate    DateTime
  status     String // PAID | UNPAID | PARTIAL
  paidDate   DateTime?
  paidAmount Int?
  categoryId String?
  
  business   Business @relation(fields: [businessId], references: [id])
  customer   Customer @relation(fields: [customerId], references: [id])

  @@index([businessId])
  @@index([customerId])
}

model Transaction {
  id               String   @id @default(cuid())
  businessId       String
  type             String // INFLOW | OUTFLOW
  amount           Int
  date             DateTime
  source           String // INVOICE_PAYMENT | OTHER_INCOME | SUPPLIER_PAYMENT | EXPENSE | OTHER
  relatedInvoiceId String?
  relatedExpenseId String?
  
  business         Business @relation(fields: [businessId], references: [id])

  @@index([businessId])
}

model Expense {
  id          String   @id @default(cuid())
  businessId  String
  supplierId  String?
  category    String
  amount      Int
  date        DateTime
  isRecurring Boolean
  
  business    Business @relation(fields: [businessId], references: [id])
  supplier    Supplier? @relation(fields: [supplierId], references: [id])

  @@index([businessId])
}

model InventoryItem {
  id             String   @id @default(cuid())
  businessId     String
  name           String
  sku            String?
  quantityOnHand Int
  unitCost       Int
  
  business       Business @relation(fields: [businessId], references: [id])

  @@index([businessId])
}
`;

// 2. Prisma singleton
files['lib/db.ts'] = `
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
`;

// 3. server.ts
files['server.ts'] = `
import { app } from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server is running on port \${PORT}\`);
});
`;

// 4. app.ts
files['app.ts'] = `
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
  const txs = await prisma.transaction.findMany();
  const cp = cashPosition(txs);
  const br = dailyBurnRate(txs, new Date());
  const rw = runwayDays(cp, br);
  
  res.json({
    cashPosition: cp,
    runway: rw,
    score: null, // Would fetch full credit score here if needed, or separate call
    alerts: [] 
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
    invoices: invoices.map(i => ({ ...i, customerId: i.customerId, status: i.status })),
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
  overdue: z.string().optional()
});
app.get('/api/invoices', asyncHandler(async (req: Request, res: Response) => {
  const q = InvoiceQuery.parse(req.query);
  let where: any = {};
  if (q.status) where.status = q.status;
  if (q.customerId) where.customerId = q.customerId;
  
  let invoices = await prisma.invoice.findMany({ where });
  if (q.overdue === 'true') {
    // Reuse finance lib overdue logic
    invoices = overdueInvoices(invoices as any, new Date()) as any;
  }
  
  res.json(invoices);
}));

// GET /api/expenses
app.get('/api/expenses', asyncHandler(async (req: Request, res: Response) => {
  const expenses = await prisma.expense.findMany();
  const anomalies = findAnomalousExpenses(expenses);
  const anomalyIds = new Set(anomalies.map(a => a.id));
  
  res.json({
    expenses: expenses.map(e => ({ ...e, isAnomaly: anomalyIds.has(e.id) })),
    aggregates: {}, // TODO grouping by category
    anomalies: anomalies.length
  });
}));

// GET /api/credit-score
app.get('/api/credit-score', asyncHandler(async (req: Request, res: Response) => {
  const invoices = await prisma.invoice.findMany();
  const transactions = await prisma.transaction.findMany();
  
  // Dummy data arrays for fields not easily extracted via Prisma directly right now
  const monthlyRevenue = [1000, 1000];
  const monthlyNetCashFlow = [200, 200];
  const customerRevenues = [{ customerId: 'c1', revenue: 5000 }];
  
  const result = creditScore({
    monthlyRevenue,
    invoices: invoices as any,
    monthlyNetCashFlow,
    transactions,
    customerRevenues,
    today: new Date()
  });
  
  res.json(result);
}));

// GET /api/insights
app.get('/api/insights', asyncHandler(async (req: Request, res: Response) => {
  res.json({ topCustomers: [], categories: [], repeatRate: 0, trends: [] });
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
  
  res.json(result);
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
  const token = jwt.sign({ businessId: 'b1' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
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
`;

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(backendDir, filename), content.trim() + '\n');
}
console.log('Successfully created Express app and Prisma schema.');
