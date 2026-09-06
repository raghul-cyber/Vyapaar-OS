const fs = require('fs');
const path = require('path');

const prismaDir = path.join(__dirname, 'prisma');
const scriptsDir = path.join(__dirname, 'scripts');
if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });

const files = {};

files['prisma/seed.ts'] = `
import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  // We lock today strictly for generating past dates relative to it.
  
  console.log('Wiping database...');
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.business.deleteMany();

  const biz = await prisma.business.create({
    data: { 
      name: 'Sharma Textiles', 
      industry: 'Manufacturing', 
      createdAt: new Date(today.getTime() - 365*86400000) 
    }
  });

  // 15-20 Customers
  const customerIds: string[] = [];
  for (let i = 1; i <= 16; i++) {
    const c = await prisma.customer.create({
      data: { businessId: biz.id, name: \`Customer \${i}\`, createdAt: new Date(today.getTime() - 360*86400000) }
    });
    customerIds.push(c.id);
  }
  const topCustomer = customerIds[0]; // Will account for 30% revenue

  // 5 Suppliers
  const supplierIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const s = await prisma.supplier.create({
      data: { businessId: biz.id, name: \`Supplier \${i}\`, createdAt: new Date(today.getTime() - 360*86400000) }
    });
    supplierIds.push(s.id);
  }

  // Categories
  const categoryIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const pc = await prisma.productCategory.create({
      data: { businessId: biz.id, name: \`Category \${i}\` }
    });
    categoryIds.push(pc.id);
  }

  const transactions: Prisma.TransactionCreateManyInput[] = [];
  const invoices: Prisma.InvoiceCreateManyInput[] = [];
  const expenses: Prisma.ExpenseCreateManyInput[] = [];

  // Goal 1: Net cash positive, runway 40-60 days.
  // Runway = currentCash / burnRate (last 30 days).
  // Let burn rate = 5000 / day. (Total 30-day outflow = 250,000, 30-day inflow = 100,000).
  // Required Cash = 5000 * 50 days = 250,000.
  // Total Historical Inflow = 1,000,000. Total Historical Outflow = 750,000. Current Cash = 250,000.
  // Last 30 days inflow = 100,000. Last 30 days outflow = 250,000. Net = -150,000. Burn = 150k/30 = 5000.
  // 365 to 30 days ago (335 days): 
  // Inflow = 900,000. Outflow = 500,000. Net = +400,000.
  // Total Cash = 400,000 - 150,000 = 250,000.
  // Runway = 250,000 / 5000 = 50 days. (Satisfies Constraint 2: 40-60 days).

  // Goal 2: 1,00,000+ collectible overdue invoices. (Satisfies Constraint 4)
  for (let i=0; i<10; i++) {
    invoices.push({
      businessId: biz.id,
      customerId: customerIds[i % customerIds.length],
      amount: 15000, // 150,000 total
      issueDate: new Date(today.getTime() - 60*86400000),
      dueDate: new Date(today.getTime() - 30*86400000), // Overdue by 30 days
      status: 'UNPAID',
      paidDate: null,
      paidAmount: null
    });
  }

  // Goal 3: Top customer (customerIds[0]) has 30% of T-90 revenue (Satisfies Constraint 1).
  // Total T-90 inflow = Last 30 (100,000) + Prev 60 (~200,000) = 300,000.
  // Top customer needs 90,000 in PAID invoices in last 90 days.
  // Remaining 15 customers share 210,000.
  // Let's generate the T-90 Inflows:
  let t90Inflow = 0;
  for (let i=0; i<30; i++) {
    const isTop = i < 9; // 9 * 10,000 = 90,000
    const amt = 10000;
    const cid = isTop ? topCustomer : customerIds[(i % 15) + 1];
    const paidD = new Date(today.getTime() - (Math.floor(Math.random() * 80) + 5) * 86400000);
    
    invoices.push({
      businessId: biz.id,
      customerId: cid,
      amount: amt,
      issueDate: new Date(paidD.getTime() - 30*86400000),
      dueDate: new Date(paidD.getTime() + 10*86400000), // Paid early or on time
      status: 'PAID',
      paidDate: paidD,
      paidAmount: amt
    });

    transactions.push({
      businessId: biz.id,
      type: 'INFLOW',
      amount: amt,
      date: paidD,
      source: 'INVOICE_PAYMENT'
    });
    t90Inflow += amt; // Total = 300,000
  }

  // Historical Inflows (Older than 90 days). Need 700,000 to reach 1,000,000 total.
  for (let i=0; i<70; i++) {
    const amt = 10000;
    const cid = customerIds[(i % 15) + 1];
    const paidD = new Date(today.getTime() - (Math.floor(Math.random() * 240) + 95) * 86400000);
    
    invoices.push({
      businessId: biz.id,
      customerId: cid,
      amount: amt,
      issueDate: new Date(paidD.getTime() - 30*86400000),
      dueDate: new Date(paidD.getTime() + 10*86400000),
      status: 'PAID',
      paidDate: paidD,
      paidAmount: amt
    });

    transactions.push({
      businessId: biz.id,
      type: 'INFLOW',
      amount: amt,
      date: paidD,
      source: 'INVOICE_PAYMENT'
    });
  }

  // Outflows
  // Total historical outflow = 750,000. Last 30 days = 250,000. Older than 30 days = 500,000.
  // Last 30 days outflows:
  let expenseCount = 0;
  for (let i=0; i<25; i++) {
    const amt = 10000;
    const d = new Date(today.getTime() - (Math.floor(Math.random() * 28) + 1) * 86400000);
    
    expenses.push({
      businessId: biz.id,
      supplierId: supplierIds[i % 5],
      category: 'Raw Materials',
      amount: amt,
      date: d,
      isRecurring: true
    });
    transactions.push({
      businessId: biz.id,
      type: 'OUTFLOW',
      amount: amt,
      date: d,
      source: 'EXPENSE'
    });
    expenseCount++;
  }

  // Older outflows
  for (let i=0; i<50; i++) {
    const amt = 10000;
    const d = new Date(today.getTime() - (Math.floor(Math.random() * 300) + 35) * 86400000);
    
    expenses.push({
      businessId: biz.id,
      supplierId: supplierIds[i % 5],
      category: 'Raw Materials',
      amount: amt,
      date: d,
      isRecurring: true
    });
    transactions.push({
      businessId: biz.id,
      type: 'OUTFLOW',
      amount: amt,
      date: d,
      source: 'EXPENSE'
    });
    expenseCount++;
  }

  // Anomalous Expenses (>=2)
  for (let i=0; i<3; i++) {
    const amt = 80000; // Super high relative to 10k mean
    const d = new Date(today.getTime() - (Math.floor(Math.random() * 100) + 10) * 86400000);
    
    expenses.push({
      businessId: biz.id,
      supplierId: supplierIds[i % 5],
      category: 'Marketing',
      amount: amt,
      date: d,
      isRecurring: false
    });
    transactions.push({
      businessId: biz.id,
      type: 'OUTFLOW',
      amount: amt,
      date: d,
      source: 'EXPENSE'
    });
    expenseCount++;
  }
  // Wait, I added 3 * 80k = 240k to outflows! 
  // Let's adjust cash position. Inflows = 1,000,000. Outflows = 750,000 + 240,000 = 990,000. Cash = 10,000.
  // Wait, runway = 10,000 / 5000 = 2 days! That breaks the constraint.
  // We must inject 240,000 into inflows older than 30 days to compensate!
  transactions.push({
    businessId: biz.id,
    type: 'INFLOW',
    amount: 240000,
    date: new Date(today.getTime() - 150*86400000),
    source: 'OTHER_INCOME'
  });
  // Now Cash = 250,000 again. Burn = 5000. Runway = 50 days.

  // Inventory
  const inventory: Prisma.InventoryItemCreateManyInput[] = [];
  for (let i = 1; i <= 10; i++) {
    inventory.push({
      businessId: biz.id,
      name: \`Thread Roll \${i}\`,
      sku: \`TR-00\${i}\`,
      quantityOnHand: 100,
      unitCost: 50
    });
  }

  await prisma.transaction.createMany({ data: transactions });
  await prisma.invoice.createMany({ data: invoices });
  await prisma.expense.createMany({ data: expenses });
  await prisma.inventoryItem.createMany({ data: inventory });

  console.log('Seed completed successfully for Sharma Textiles.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
`;

files['scripts/validateSeed.ts'] = `
import { PrismaClient } from '@prisma/client';
import { cashPosition } from '../src/lib/finance/cashPosition';
import { dailyBurnRate } from '../src/lib/finance/burnRate';
import { runwayDays } from '../src/lib/finance/runway';
import { creditScore } from '../src/lib/finance/creditScore';

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  const txs = await prisma.transaction.findMany();
  const invoices = await prisma.invoice.findMany();
  const customers = await prisma.customer.findMany();

  // Constraint 1: One customer contributes 25-35% of trailing-90-day revenue
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 86400000);
  let totalT90Rev = 0;
  const customerRevMap = new Map<string, number>();

  for (const inv of invoices) {
    if (inv.status === 'PAID' && inv.paidDate && inv.paidDate >= ninetyDaysAgo) {
      totalT90Rev += inv.paidAmount || inv.amount;
      const cur = customerRevMap.get(inv.customerId) || 0;
      customerRevMap.set(inv.customerId, cur + (inv.paidAmount || inv.amount));
    }
  }

  let maxPct = 0;
  for (const amt of customerRevMap.values()) {
    const pct = amt / totalT90Rev;
    if (pct > maxPct) maxPct = pct;
  }

  if (maxPct < 0.25 || maxPct > 0.35) {
    console.error(\`❌ Constraint 1 Failed: Top customer revenue share is \${(maxPct*100).toFixed(2)}% (expected 25-35%)\`);
    process.exit(1);
  }
  console.log(\`✅ Constraint 1 Passed: Top customer share is \${(maxPct*100).toFixed(2)}%\`);

  // Constraint 2: Net cash position positive, runway 40-60 days
  const cash = cashPosition(txs as any);
  if (cash <= 0) {
    console.error(\`❌ Constraint 2 Failed: Cash is \${cash} (expected > 0)\`);
    process.exit(1);
  }

  const burn = dailyBurnRate(txs as any, today);
  const runway = runwayDays(cash, burn);
  if (typeof runway === 'string' || runway < 40 || runway > 60) {
    console.error(\`❌ Constraint 2 Failed: Runway is \${runway} days (expected 40-60)\`);
    process.exit(1);
  }
  console.log(\`✅ Constraint 2 Passed: Cash is \${cash}, Burn is \${burn}, Runway is \${runway} days\`);

  // Constraint 4: At least 1,00,000 in collectible overdue invoices
  let overdueSum = 0;
  for (const inv of invoices) {
    if (inv.status !== 'PAID' && inv.dueDate < today) {
      overdueSum += inv.amount;
    }
  }
  if (overdueSum < 100000) {
    console.error(\`❌ Constraint 4 Failed: Overdue invoices total \${overdueSum} (expected >= 100000)\`);
    process.exit(1);
  }
  console.log(\`✅ Constraint 4 Passed: Overdue invoices total \${overdueSum}\`);

  // Constraint 3: Credit score 55-75
  // We need to compute monthlyRevenue and monthlyNetCashFlow from txs for the past 12 months.
  const monthlyRevenue = new Array(12).fill(0);
  const monthlyNetCashFlow = new Array(12).fill(0);
  
  for (const tx of txs) {
    const msDiff = today.getTime() - tx.date.getTime();
    const monthsAgo = Math.floor(msDiff / (30 * 86400000));
    if (monthsAgo >= 0 && monthsAgo < 12) {
      const idx = 11 - monthsAgo; // oldest is 0, newest is 11
      if (tx.type === 'INFLOW') {
        monthlyRevenue[idx] += tx.amount;
        monthlyNetCashFlow[idx] += tx.amount;
      } else {
        monthlyNetCashFlow[idx] -= tx.amount;
      }
    }
  }

  const customerRevenues = customers.map(c => ({
    customerId: c.id,
    revenue: customerRevMap.get(c.id) || 0
  }));

  const result = creditScore({
    monthlyRevenue,
    invoices: invoices as any,
    monthlyNetCashFlow,
    transactions: txs as any,
    customerRevenues,
    today
  });

  if (result.score < 55 || result.score > 75) {
    console.error(\`❌ Constraint 3 Failed: Credit score is \${result.score} (expected 55-75)\`);
    console.log(result._debugSubScores);
    process.exit(1);
  }
  console.log(\`✅ Constraint 3 Passed: Credit score is \${result.score}\`);

  console.log('🎉 All constraints satisfied!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
`;

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(__dirname, filename), content.trim() + '\n');
}
console.log('Created seed.ts and validateSeed.ts');
