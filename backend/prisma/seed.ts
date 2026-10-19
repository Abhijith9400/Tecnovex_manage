/**
 * Seeds base configuration, the initial administrator and clearly fictional sample data.
 * Safe to run more than once (upserts / skips existing rows).
 *
 *   SEED_ADMIN_EMAIL     default admin@example.com
 *   SEED_ADMIN_PASSWORD  if unset, a strong random password is generated and printed ONCE
 *   SEED_SAMPLE_DATA     "false" to skip sample clients/invoices/employees
 */
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "../src/db/prisma";
import { seedSampleData } from "./sampleData";

const expenseCategories = ["Software & Subscriptions", "Advertising Spend", "Office Rent", "Utilities", "Freelancers", "Equipment", "Travel", "Bank Charges", "Miscellaneous"];
const incomeCategories = ["Interest", "Refunds", "Grants", "Asset Sale", "Miscellaneous"];

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists; password unchanged.`);
    return;
  }
  const provided = process.env.SEED_ADMIN_PASSWORD?.trim() || undefined;
  if (provided && provided.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  const password = provided ?? randomBytes(12).toString("base64url");
  await prisma.user.create({
    data: { email, name: "Administrator", role: "ADMIN", passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
  });
  console.log("\n=== Initial administrator created ===");
  console.log(`  Email:    ${email}`);
  console.log(provided ? "  Password: (from SEED_ADMIN_PASSWORD)" : `  Password: ${password}`);
  console.log("  Change this password after first login (Settings > My account).\n");
}

async function main() {
  const template = await prisma.invoiceTemplate.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Default",
      layout: "CLASSIC",
      footerText: "Thank you for your business.",
    },
    update: {},
  });

  await prisma.companySettings.upsert({
    where: { id: 1 },
    // Placeholders only: replace in Settings > Company. No real company details are assumed.
    create: { id: 1, legalName: "Your Agency Name", activeTemplateId: template.id, paymentTermsText: "Payment due within 15 days of the invoice date." },
    update: {},
  });

  for (const name of expenseCategories) {
    await prisma.category.upsert({ where: { type_name: { type: "EXPENSE", name } }, create: { type: "EXPENSE", name }, update: {} });
  }
  for (const name of incomeCategories) {
    await prisma.category.upsert({ where: { type_name: { type: "INCOME", name } }, create: { type: "INCOME", name }, update: {} });
  }

  await seedAdmin();

  if (process.env.SEED_SAMPLE_DATA !== "false") {
    await seedSampleData();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
