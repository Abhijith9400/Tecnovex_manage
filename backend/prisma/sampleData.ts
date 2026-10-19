/** Clearly fictional sample data for local development. All names use example.com / .test domains. */
import { prisma } from "../src/db/prisma";
import { calculateInvoiceTotals } from "../src/utils/money";

export async function seedSampleData() {
  if ((await prisma.client.count()) > 0) {
    console.log("Sample data skipped: clients already exist.");
    return;
  }

  const acme = await prisma.client.create({
    data: {
      name: "Acme Bakery (Sample)",
      contactPerson: "Priya Example",
      email: "priya@acme-bakery.example.com",
      phone: "+91 90000 00001",
      addressLine1: "12 Sample Street",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      billingType: "RETAINER",
      monthlyRetainer: "45000.00",
      billingCycle: "MONTHLY",
      paymentTermsDays: 15,
      status: "ACTIVE",
      notes: "Fictional sample client.",
      services: {
        create: [
          { name: "Social media management", description: "Instagram + Facebook, 12 posts / month", quantity: "1", unitPrice: "35000.00", taxRate: "18.00", sacCode: "998361" },
          { name: "Reels production", description: "4 short-form reels / month", quantity: "4", unitPrice: "2500.00", taxRate: "18.00", sacCode: "998361" },
        ],
      },
    },
  });

  const northwind = await prisma.client.create({
    data: {
      name: "Northwind Fitness (Sample)",
      contactPerson: "Arjun Sample",
      email: "arjun@northwind-fitness.example.com",
      phone: "+91 90000 00002",
      city: "Bengaluru",
      state: "Karnataka",
      billingType: "PROJECT",
      projectPrice: "120000.00",
      billingCycle: "ONE_TIME",
      paymentTermsDays: 30,
      status: "ACTIVE",
      services: {
        create: [{ name: "Brand launch campaign", quantity: "1", unitPrice: "120000.00", taxRate: "0", isRecurring: false }],
      },
    },
  });

  await prisma.client.create({
    data: { name: "Globex Cafe (Sample)", contactPerson: "Meera Test", email: "meera@globex.example.com", status: "LEAD", billingType: "RETAINER", monthlyRetainer: "25000.00" },
  });

  const today = new Date();
  const year = today.getUTCFullYear();
  const agreement = await prisma.clientAgreement.create({
    data: {
      clientId: acme.id,
      title: "Social Media Retainer 2026",
      reference: "AGR-SAMPLE-001",
      effectiveDate: new Date(Date.UTC(year, 0, 1)),
      expiryDate: new Date(Date.UTC(year, 11, 31)),
      contractValue: "540000.00",
      status: "ACTIVE",
      scopeOfWork: "Monthly social media management for Instagram and Facebook including content calendar, design and publishing.",
      monthlyDeliverables: "12 posts, 2 carousels, 4 reels, monthly performance report",
      postsPerMonth: 12,
      carouselsPerMonth: 2,
      reelsPerMonth: 4,
      revisionLimit: 2,
      exclusions: "Paid ad spend, influencer fees, printing.",
      paymentTerms: "Monthly in advance, due within 15 days of invoice.",
    },
  });

  await prisma.project.create({
    data: { clientId: acme.id, agreementId: agreement.id, name: "Diwali campaign", status: "IN_PROGRESS", startDate: new Date(Date.UTC(year, 9, 1)), budget: "60000.00" },
  });
  await prisma.project.create({
    data: { clientId: northwind.id, name: "Brand launch", status: "PLANNED", budget: "120000.00" },
  });

  const employee = await prisma.employee.create({
    data: {
      employeeCode: "EMP-0001",
      fullName: "Riya Designer (Sample)",
      email: "riya@agency.example.com",
      designation: "Graphic Designer",
      department: "Creative",
      joiningDate: new Date(Date.UTC(year - 1, 5, 1)),
      salaryStructures: {
        create: { effectiveFrom: new Date(Date.UTC(year - 1, 5, 1)), basic: "30000.00", allowances: "8000.00", otherEarnings: "0", fixedDeductions: "0" },
      },
    },
  });
  await prisma.employee.create({
    data: {
      employeeCode: "EMP-0002",
      fullName: "Kabir Strategist (Sample)",
      email: "kabir@agency.example.com",
      designation: "Content Strategist",
      department: "Strategy",
      joiningDate: new Date(Date.UTC(year, 1, 15)),
      salaryStructures: {
        create: { effectiveFrom: new Date(Date.UTC(year, 1, 15)), basic: "35000.00", allowances: "10000.00", fixedDeductions: "500.00" },
      },
    },
  });

  // A draft invoice from Acme's recurring services (left as a draft so you can try issuing it yourself).
  const services = await prisma.service.findMany({ where: { clientId: acme.id }, orderBy: { createdAt: "asc" } });
  const { lines, totals } = calculateInvoiceTotals(services.map((s) => ({ quantity: s.quantity, unitPrice: s.unitPrice, taxRate: s.taxRate })));
  const period = `${year}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const issueDate = new Date(Date.UTC(year, today.getUTCMonth(), 1));
  await prisma.invoice.create({
    data: {
      clientId: acme.id,
      billingPeriod: period,
      recurringKey: `${acme.id}:${period}`,
      issueDate,
      dueDate: new Date(issueDate.getTime() + 15 * 86_400_000),
      billToName: acme.name,
      billToAddress: "12 Sample Street\nPune, Maharashtra, 411001\nIndia",
      billToEmail: acme.email,
      ...totals,
      items: {
        create: services.map((s, i) => ({
          serviceId: s.id,
          description: s.description ? `${s.name} - ${s.description}` : s.name,
          sacCode: s.sacCode,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          taxRate: s.taxRate,
          ...lines[i],
          sortOrder: i,
        })),
      },
    },
  });

  const [software, rent] = await Promise.all([
    prisma.category.findUniqueOrThrow({ where: { type_name: { type: "EXPENSE", name: "Software & Subscriptions" } } }),
    prisma.category.findUniqueOrThrow({ where: { type_name: { type: "EXPENSE", name: "Office Rent" } } }),
  ]);
  const interest = await prisma.category.findUniqueOrThrow({ where: { type_name: { type: "INCOME", name: "Interest" } } });
  await prisma.expense.createMany({
    data: [
      { title: "Design tool subscription (sample)", categoryId: software.id, amount: "1500.00", expenseDate: issueDate, vendor: "Example Software Co.", paymentMethod: "CARD" },
      { title: "Co-working desk rent (sample)", categoryId: rent.id, amount: "12000.00", expenseDate: issueDate, vendor: "Sample Workspace", paymentMethod: "BANK_TRANSFER" },
    ],
  });
  await prisma.incomeEntry.create({
    data: { description: "Savings account interest (sample)", categoryId: interest.id, amount: "425.50", incomeDate: issueDate, source: "Example Bank", paymentMethod: "BANK_TRANSFER" },
  });

  console.log(`Sample data created (clients, services, agreement, projects, employees incl. ${employee.employeeCode}, a draft invoice, expenses and other income).`);
}
