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
      createdAt: new Date(today.getTime() - 730*86400000) 
    }
  });

  // 15-20 Customers
  const customerIds: string[] = [];
  for (let i = 1; i <= 16; i++) {
    const c = await prisma.customer.create({
      data: { businessId: biz.id, name: `Customer ${i}`, createdAt: new Date(today.getTime() - 360*86400000) }
    });
    customerIds.push(c.id);
  }
  const topCustomer = customerIds[0]; // Will account for 30% revenue

  // 5 Suppliers
  const supplierIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const s = await prisma.supplier.create({
      data: { businessId: biz.id, name: `Supplier ${i}`, createdAt: new Date(today.getTime() - 360*86400000) }
    });
    supplierIds.push(s.id);
  }

  // Categories
  const categoryIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const pc = await prisma.productCategory.create({
      data: { businessId: biz.id, name: `Category ${i}` }
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
  // Total T-90 inflow = 300,000.
  // Last 30 days inflow EXACTLY 100,000 (10 transactions of 10,000).
  // Day 31-90 inflow EXACTLY 200,000 (20 transactions of 10,000).
  let topCustCount = 9; // 9 * 10,000 = 90,000 (30% of 300,000)
  
  for (let i=0; i<30; i++) {
    const amt = 10000;
    const isTop = (i < topCustCount);
    const cid = isTop ? topCustomer : customerIds[(i % 15) + 1];
    
    // First 10 land in the last 30 days. Next 20 land in days 31-90.
    const daysAgo = i < 10 ? (15 + i) : (40 + i); 
    const paidD = new Date(today.getTime() - daysAgo * 86400000);
    
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
  }

  // Historical Inflows (Older than 90 days). Need 700,000 to reach 1,000,000 total.
  for (let i=0; i<70; i++) {
    const amt = 10000;
    const cid = customerIds[(i % 15) + 1];
    const paidD = new Date(today.getTime() - (95 + i*9) * 86400000); // 95 to ~725 days ago
    const lateDays = (i % 2 === 0) ? 30 : -10; // Half are 30 days late, half are 10 days early
    
    invoices.push({
      businessId: biz.id,
      customerId: cid,
      amount: amt,
      issueDate: new Date(paidD.getTime() - 60*86400000), // Issued 60 days before payment
      dueDate: new Date(paidD.getTime() - lateDays*86400000), // Due before or after payment
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
  // Last 30 days outflows exactly 250,000
  let expenseCount = 0;
  for (let i=0; i<25; i++) {
    const amt = 10000;
    const d = new Date(today.getTime() - (i + 1) * 86400000); // 1 to 25 days ago
    
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

  // Older outflows (500,000)
  for (let i=0; i<50; i++) {
    const amt = 10000;
    const d = new Date(today.getTime() - (35 + i*5) * 86400000); // 35 to 285 days ago
    
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

  // Anomalous Expenses (>=2), MUST be older than 30 days so it doesn't skew the 50 day runway calculation.
  for (let i=0; i<3; i++) {
    const amt = 80000; // Super high relative to 10k mean
    const d = new Date(today.getTime() - (50 + i*15) * 86400000); // 50 to 80 days ago
    
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
      name: `Thread Roll ${i}`,
      sku: `TR-00${i}`,
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
