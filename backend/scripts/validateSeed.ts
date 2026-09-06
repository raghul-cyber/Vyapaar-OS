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
    console.error(`❌ Constraint 1 Failed: Top customer revenue share is ${(maxPct*100).toFixed(2)}% (expected 25-35%)`);
    process.exit(1);
  }
  console.log(`✅ Constraint 1 Passed: Top customer share is ${(maxPct*100).toFixed(2)}%`);

  // Constraint 2: Net cash position positive, runway 40-60 days
  const cash = cashPosition(txs as any);
  if (cash <= 0) {
    console.error(`❌ Constraint 2 Failed: Cash is ${cash} (expected > 0)`);
    process.exit(1);
  }

  const burn = dailyBurnRate(txs as any, today);
  const runway = runwayDays(cash, burn);
  if (runway === null || typeof runway === 'string' || runway < 40 || runway > 60) {
    console.error(`❌ Constraint 2 Failed: Runway is ${runway} days (expected 40-60)`);
    process.exit(1);
  }
  console.log(`✅ Constraint 2 Passed: Cash is ${cash}, Burn is ${burn}, Runway is ${runway} days`);

  // Constraint 4: At least 1,00,000 in collectible overdue invoices
  let overdueSum = 0;
  for (const inv of invoices) {
    if (inv.status !== 'PAID' && inv.dueDate < today) {
      overdueSum += inv.amount;
    }
  }
  if (overdueSum < 100000) {
    console.error(`❌ Constraint 4 Failed: Overdue invoices total ${overdueSum} (expected >= 100000)`);
    process.exit(1);
  }
  console.log(`✅ Constraint 4 Passed: Overdue invoices total ${overdueSum}`);

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
    console.error(`❌ Constraint 3 Failed: Credit score is ${result.score} (expected 55-75)`);
    console.log(result._debugSubScores);
    process.exit(1);
  }
  console.log(`✅ Constraint 3 Passed: Credit score is ${result.score}`);

  console.log('🎉 All constraints satisfied!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
