import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";
import type { employeeListQuery, employeeSchema, salaryStructureSchema } from "../validators/employee.validators";
import { audit, diff } from "./audit.service";
import { nextSequence } from "./sequence.service";

/** Masks all but the last 4 digits; used wherever full bank details are not needed. */
export function maskAccount(value: string | null) {
  return value ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : null;
}

/** Structure in force for a given date: latest effectiveFrom on or before it. */
export function currentStructure<T extends { effectiveFrom: Date }>(structures: T[], onDate: Date): T | null {
  return [...structures].filter((s) => s.effectiveFrom <= onDate).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}

export async function listEmployees(query: z.infer<typeof employeeListQuery>) {
  const where: Prisma.EmployeeWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { employeeCode: { contains: query.search, mode: "insensitive" } },
            { designation: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({ where, include: { salaryStructures: true }, orderBy: { employeeCode: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.employee.count({ where }),
  ]);
  const today = new Date();
  const items = rows.map(({ salaryStructures, bankAccountNumber, pan, ...e }) => ({
    ...e,
    pan: pan ? maskAccount(pan) : null,
    bankAccountNumber: maskAccount(bankAccountNumber),
    currentSalary: currentStructure(salaryStructures, today),
  }));
  return { items, total };
}

/** Active/on-leave employees with only non-sensitive fields. */
export function employeeOptions() {
  return prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { id: true, fullName: true, employeeCode: true },
    orderBy: { fullName: "asc" },
  });
}

export async function getEmployee(id: string) {
  const employee = await prisma.employee.findUnique({ where: { id }, include: { salaryStructures: { orderBy: { effectiveFrom: "desc" } } } });
  if (!employee) throw AppError.notFound("Employee");
  return { ...employee, currentSalary: currentStructure(employee.salaryStructures, new Date()) };
}

async function generateEmployeeCode(tx: Prisma.TransactionClient) {
  for (;;) {
    const code = `EMP-${String(await nextSequence(tx, "employee")).padStart(4, "0")}`;
    if (!(await tx.employee.findUnique({ where: { employeeCode: code } }))) return code;
  }
}

export async function createEmployee(req: Request, input: z.infer<typeof employeeSchema>) {
  const employee = await prisma.$transaction(async (tx) => {
    const employeeCode = input.employeeCode ?? (await generateEmployeeCode(tx));
    if (await tx.employee.findUnique({ where: { employeeCode } })) throw AppError.conflict(`Employee ID ${employeeCode} is already in use`);
    const created = await tx.employee.create({ data: { ...input, employeeCode } });
    await audit(req, { action: "CREATE", entityType: "Employee", entityId: created.id, summary: `Employee ${created.employeeCode} ${created.fullName} added` }, tx);
    return created;
  });
  return getEmployee(employee.id);
}

export async function updateEmployee(req: Request, id: string, input: z.infer<typeof employeeSchema>) {
  const before = await prisma.employee.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Employee");
  const employeeCode = input.employeeCode ?? before.employeeCode;
  if (employeeCode !== before.employeeCode && (await prisma.employee.findUnique({ where: { employeeCode } }))) {
    throw AppError.conflict(`Employee ID ${employeeCode} is already in use`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { ...input, employeeCode } });
    // Bank details are sensitive: log that they changed, never their values.
    const changes = diff(before, { ...input, employeeCode }) as Record<string, unknown>;
    for (const key of ["bankAccountNumber", "pan", "bankIfsc", "bankAccountName", "bankName"]) if (changes[key]) changes[key] = "changed";
    await audit(req, { action: "UPDATE", entityType: "Employee", entityId: id, summary: `Employee ${employeeCode} updated`, changes: changes as Prisma.InputJsonValue }, tx);
  });
  return getEmployee(id);
}

export async function addSalaryStructure(req: Request, employeeId: string, input: z.infer<typeof salaryStructureSchema>) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw AppError.notFound("Employee");
  const clash = await prisma.salaryStructure.findUnique({ where: { employeeId_effectiveFrom: { employeeId, effectiveFrom: input.effectiveFrom } } });
  if (clash) throw AppError.conflict("A salary structure already starts on this date");
  await prisma.$transaction(async (tx) => {
    const structure = await tx.salaryStructure.create({ data: { ...input, employeeId } });
    await audit(req, {
      action: "CREATE",
      entityType: "SalaryStructure",
      entityId: structure.id,
      summary: `Salary revision for ${employee.employeeCode} effective ${input.effectiveFrom.toISOString().slice(0, 10)} (basic ${input.basic})`,
    }, tx);
  });
  return getEmployee(employeeId);
}

/** Only structures not yet used by any payroll record can be removed (salary history is preserved). */
export async function deleteSalaryStructure(req: Request, employeeId: string, structureId: string) {
  const structure = await prisma.salaryStructure.findFirst({ where: { id: structureId, employeeId }, include: { _count: { select: { payrollRecords: true } } } });
  if (!structure) throw AppError.notFound("Salary structure");
  if (structure._count.payrollRecords > 0) throw AppError.badRequest("This salary structure has been used in payroll and cannot be deleted. Add a new revision instead.");
  await prisma.$transaction(async (tx) => {
    await tx.salaryStructure.delete({ where: { id: structureId } });
    await audit(req, { action: "DELETE", entityType: "SalaryStructure", entityId: structureId, summary: "Unused salary structure deleted" }, tx);
  });
  return getEmployee(employeeId);
}
