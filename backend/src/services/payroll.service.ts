import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma, type Tx } from "../db/prisma";
import type { AuthUser } from "../types/express";
import { AppError } from "../utils/AppError";
import { monthEnd, parsePeriod, periodLabel } from "../utils/dates";
import { money, sum } from "../utils/money";
import type { adjustmentSchema, payrollInputSchema, payrollListQuery, payrollPaySchema, statutorySchema } from "../validators/employee.validators";
import { audit } from "./audit.service";
import { currentStructure } from "./employee.service";
import { calculatePayroll, type MonthInput } from "./payrollCalculator";

type MonthInputs = z.infer<typeof payrollInputSchema>;

const listInclude = {
  employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
  approvedBy: { select: { name: true } },
  adjustments: { select: { amount: true } },
} satisfies Prisma.PayrollRecordInclude;

const detailInclude = {
  employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
  approvedBy: { select: { name: true } },
  lines: { orderBy: { sortOrder: "asc" } },
  adjustments: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { name: true } } } },
} satisfies Prisma.PayrollRecordInclude;

function withAdjustments<T extends { adjustments: { amount: Prisma.Decimal }[] }>(record: T) {
  return { ...record, adjustmentsTotal: sum(record.adjustments.map((a) => a.amount)).toFixed(2) };
}

// ---------------------------------------------------------------------------
// Statutory deduction rules
// ---------------------------------------------------------------------------

export function listStatutory() {
  return prisma.statutoryDeduction.findMany({ orderBy: { name: "asc" } });
}

export async function saveStatutory(req: Request, id: string | null, input: z.infer<typeof statutorySchema>) {
  if (input.basis !== "FIXED" && Number(input.value) > 100) throw AppError.badRequest("A percentage cannot exceed 100");
  const clash = await prisma.statutoryDeduction.findUnique({ where: { name: input.name } });
  if (clash && clash.id !== id) throw AppError.conflict("A rule with this name already exists");
  return prisma.$transaction(async (tx) => {
    const rule = id ? await tx.statutoryDeduction.update({ where: { id }, data: input }) : await tx.statutoryDeduction.create({ data: input });
    await audit(req, { action: id ? "UPDATE" : "CREATE", entityType: "StatutoryDeduction", entityId: rule.id, summary: `Payroll deduction rule "${rule.name}" saved (${rule.basis} ${rule.value})` }, tx);
    return rule;
  });
}

// ---------------------------------------------------------------------------
// Payroll records
// ---------------------------------------------------------------------------

export async function listPayroll(query: z.infer<typeof payrollListQuery>, restrictToEmployeeId?: string) {
  const where: Prisma.PayrollRecordWhereInput = {
    ...(query.period ? (() => {
      const { year, month } = parsePeriod(query.period);
      return { periodYear: year, periodMonth: month };
    })() : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(restrictToEmployeeId ? { employeeId: restrictToEmployeeId, status: "PAID" as const } : {}),
    ...(query.search ? { employee: { OR: [{ fullName: { contains: query.search, mode: "insensitive" } }, { employeeCode: { contains: query.search, mode: "insensitive" } }] } } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.payrollRecord.findMany({
      where,
      include: listInclude,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { employee: { employeeCode: "asc" } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payrollRecord.count({ where }),
  ]);
  return { items: rows.map(({ adjustments, ...r }) => ({ ...r, adjustmentsTotal: sum(adjustments.map((a) => a.amount)).toFixed(2) })), total };
}

/** Admins and managers see any record; employees only their own paid payslips. */
export async function getPayroll(id: string, user: AuthUser) {
  const record = await prisma.payrollRecord.findUnique({ where: { id }, include: detailInclude });
  if (!record) throw AppError.notFound("Payroll record");
  if (user.role !== "ADMIN" && user.role !== "MANAGER" && (user.role !== "EMPLOYEE" || record.employeeId !== user.employeeId || record.status !== "PAID")) {
    throw AppError.notFound("Payroll record");
  }
  return withAdjustments(record);
}

async function calculateFor(tx: Tx, employeeId: string, year: number, month: number, inputs: MonthInput) {
  const employee = await tx.employee.findUnique({ where: { id: employeeId }, include: { salaryStructures: true } });
  if (!employee) throw AppError.badRequest("Employee not found");
  const structure = currentStructure(employee.salaryStructures, monthEnd(year, month));
  if (!structure) throw AppError.badRequest(`${employee.fullName} has no salary structure effective for ${periodLabel(year, month)}`);
  const rules = structure.applyStatutory ? await tx.statutoryDeduction.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) : [];
  try {
    return { employee, structure, result: calculatePayroll(structure, rules, inputs) };
  } catch (error) {
    if (error instanceof RangeError) throw AppError.badRequest(error.message);
    throw error;
  }
}

function lineRows(result: ReturnType<typeof calculatePayroll>) {
  return result.lines.map((line, index) => ({ type: line.type, label: line.label, amount: line.amount, sortOrder: index }));
}

export async function createPayroll(req: Request, employeeId: string, period: string, inputs: MonthInputs) {
  const { year, month } = parsePeriod(period);
  const existing = await prisma.payrollRecord.findUnique({ where: { employeeId_periodYear_periodMonth: { employeeId, periodYear: year, periodMonth: month } } });
  if (existing) throw AppError.conflict(`Payroll for ${periodLabel(year, month)} already exists for this employee`);
  const record = await prisma.$transaction(async (tx) => {
    const { employee, structure, result } = await calculateFor(tx, employeeId, year, month, inputs);
    const created = await tx.payrollRecord.create({
      data: {
        employeeId,
        salaryStructureId: structure.id,
        periodYear: year,
        periodMonth: month,
        grossEarnings: result.grossEarnings,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
        notes: inputs.notes ?? null,
        monthInputs: { incentives: inputs.incentives, additionalEarnings: inputs.additionalEarnings, additionalDeductions: inputs.additionalDeductions },
        lines: { create: lineRows(result) },
      },
    });
    await audit(req, { action: "CREATE", entityType: "PayrollRecord", entityId: created.id, summary: `Payroll for ${employee.employeeCode} - ${periodLabel(year, month)} created (net ${result.netPay.toFixed(2)})` }, tx);
    return created;
  });
  return getPayroll(record.id, req.user!);
}

/** Creates pending payroll for every active employee with a salary structure; skips existing records. */
export async function generatePayroll(req: Request, period: string) {
  const { year, month } = parsePeriod(period);
  const employees = await prisma.employee.findMany({ where: { status: { in: ["ACTIVE", "ON_LEAVE"] }, joiningDate: { lte: monthEnd(year, month) } }, orderBy: { employeeCode: "asc" } });
  const created: string[] = [];
  const skipped: { employee: string; reason: string }[] = [];
  for (const employee of employees) {
    try {
      await createPayroll(req, employee.id, period, { incentives: "0", additionalEarnings: [], additionalDeductions: [], notes: null });
      created.push(`${employee.employeeCode} ${employee.fullName}`);
    } catch (error) {
      skipped.push({ employee: `${employee.employeeCode} ${employee.fullName}`, reason: error instanceof Error ? error.message : "Failed" });
    }
  }
  return { created, skipped };
}

export async function findWithStatus(id: string, allowed: string[], action: string) {
  const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { employee: true } });
  if (!record) throw AppError.notFound("Payroll record");
  if (!allowed.includes(record.status)) {
    throw AppError.badRequest(record.status === "PAID" ? `Paid payroll cannot be ${action}. Add an adjustment instead.` : `Payroll must be ${allowed.join(" or ").toLowerCase()} to be ${action}`);
  }
  return record;
}

export async function updatePayroll(req: Request, id: string, inputs: MonthInputs) {
  const record = await findWithStatus(id, ["PENDING"], "edited");
  await prisma.$transaction(async (tx) => {
    const { structure, result } = await calculateFor(tx, record.employeeId, record.periodYear, record.periodMonth, inputs);
    await tx.payrollLine.deleteMany({ where: { payrollRecordId: id } });
    await tx.payrollRecord.update({
      where: { id },
      data: {
        salaryStructureId: structure.id,
        grossEarnings: result.grossEarnings,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
        notes: inputs.notes ?? null,
        monthInputs: { incentives: inputs.incentives, additionalEarnings: inputs.additionalEarnings, additionalDeductions: inputs.additionalDeductions },
        lines: { create: lineRows(result) },
      },
    });
    await audit(req, {
      action: "UPDATE",
      entityType: "PayrollRecord",
      entityId: id,
      summary: `Payroll for ${record.employee.employeeCode} - ${periodLabel(record.periodYear, record.periodMonth)} recalculated (net ${record.netPay.toFixed(2)} → ${result.netPay.toFixed(2)})`,
    }, tx);
  });
  return getPayroll(id, req.user!);
}

export async function approvePayroll(req: Request, id: string) {
  const record = await findWithStatus(id, ["PENDING"], "approved");
  await prisma.$transaction(async (tx) => {
    await tx.payrollRecord.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: req.user?.id } });
    await audit(req, { action: "APPROVE", entityType: "PayrollRecord", entityId: id, summary: `Payroll for ${record.employee.employeeCode} - ${periodLabel(record.periodYear, record.periodMonth)} approved` }, tx);
  });
  return getPayroll(id, req.user!);
}

export async function reopenPayroll(req: Request, id: string) {
  const record = await findWithStatus(id, ["APPROVED"], "reopened");
  await prisma.$transaction(async (tx) => {
    await tx.payrollRecord.update({ where: { id }, data: { status: "PENDING", approvedAt: null, approvedById: null } });
    await audit(req, { action: "REOPEN", entityType: "PayrollRecord", entityId: id, summary: `Payroll for ${record.employee.employeeCode} - ${periodLabel(record.periodYear, record.periodMonth)} moved back to pending` }, tx);
  });
  return getPayroll(id, req.user!);
}

export async function markPaid(req: Request, id: string, input: z.infer<typeof payrollPaySchema>) {
  const record = await findWithStatus(id, ["APPROVED"], "marked paid");
  await prisma.$transaction(async (tx) => {
    await tx.payrollRecord.update({ where: { id }, data: { status: "PAID", ...input } });
    await audit(req, {
      action: "PAY",
      entityType: "PayrollRecord",
      entityId: id,
      summary: `Payroll for ${record.employee.employeeCode} - ${periodLabel(record.periodYear, record.periodMonth)} paid (${record.netPay.toFixed(2)} via ${input.paymentMethod})`,
    }, tx);
  });
  return getPayroll(id, req.user!);
}

export async function deletePayroll(req: Request, id: string) {
  const record = await findWithStatus(id, ["PENDING"], "deleted");
  await prisma.$transaction(async (tx) => {
    await tx.payrollRecord.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "PayrollRecord", entityId: id, summary: `Pending payroll for ${record.employee.employeeCode} - ${periodLabel(record.periodYear, record.periodMonth)} deleted` }, tx);
  });
}

/** Auditable correction to a paid record. The original record is never modified. */
export async function addAdjustment(req: Request, id: string, input: z.infer<typeof adjustmentSchema>) {
  const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { employee: true, adjustments: true } });
  if (!record) throw AppError.notFound("Payroll record");
  if (record.status !== "PAID") throw AppError.badRequest("Adjustments apply to paid payroll only. Edit the pending record instead.");
  const adjustedNet = money(record.netPay).plus(sum(record.adjustments.map((a) => a.amount))).plus(input.amount);
  if (adjustedNet.isNegative()) throw AppError.badRequest("Adjustment would make the total paid for this month negative");
  await prisma.$transaction(async (tx) => {
    const adjustment = await tx.payrollAdjustment.create({
      data: { payrollRecordId: id, amount: input.amount, reason: input.reason, paidAt: input.paidAt, paymentMethod: input.paymentMethod ?? null, paymentReference: input.paymentReference, createdById: req.user?.id },
    });
    await audit(req, {
      action: "ADJUST",
      entityType: "PayrollRecord",
      entityId: id,
      summary: `Adjustment of ${input.amount} on ${record.employee.employeeCode} - ${periodLabel(record.periodYear, record.periodMonth)}: ${input.reason}`,
      changes: { adjustmentId: adjustment.id },
    }, tx);
  });
  return getPayroll(id, req.user!);
}
