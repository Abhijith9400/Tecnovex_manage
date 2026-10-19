import { prisma } from "../../db/prisma";
import { AppError } from "../../utils/AppError";
import { amountInWords } from "../../utils/amountInWords";
import { formatDisplayDate, periodLabel } from "../../utils/dates";
import { formatAmount, money, sum } from "../../utils/money";
import { maskAccount } from "../employee.service";
import { addressLines, body, COLORS, CONTENT_WIDTH, createDoc, type Doc, footer, hr, label, loadImage, PAGE, renderToBuffer, watermark } from "./pdfUtils";

const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", UPI: "UPI", CASH: "Cash", CHEQUE: "Cheque", CARD: "Card", OTHER: "Other" };

function table(doc: Doc, title: string, rows: [string, string][], totalLabel: string, total: string, x: number, y: number, width: number, color: string) {
  doc.save().rect(x, y, width, 20).fill(color).restore();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#FFFFFF").text(title.toUpperCase(), x + 8, y + 6, { width: width - 90 });
  doc.text("AMOUNT", x + width - 88, y + 6, { width: 80, align: "right" });
  let rowY = y + 26;
  for (const [name, amount] of rows) {
    body(doc, name, x + 8, rowY, { width: width - 100 }, false, 9);
    body(doc, amount, x + width - 88, rowY, { width: 80, align: "right" }, false, 9);
    rowY = Math.max(doc.y, rowY + 11) + 5;
    hr(doc, rowY - 3, COLORS.line, x, x + width);
  }
  if (rows.length === 0) {
    body(doc, "None", x + 8, rowY, { width: width - 16 }, false, 9);
    rowY += 16;
  }
  body(doc, totalLabel, x + 8, rowY + 2, { width: width - 100 }, true, 9.5);
  body(doc, total, x + width - 88, rowY + 2, { width: 80, align: "right" }, true, 9.5);
  return rowY + 20;
}

/** Payslip generated from the saved payroll record (and any adjustments). */
export async function renderPayslipPdf(payrollId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const record = await prisma.payrollRecord.findUnique({
    where: { id: payrollId },
    include: { employee: true, lines: { orderBy: { sortOrder: "asc" } }, adjustments: { orderBy: { createdAt: "asc" } } },
  });
  if (!record) throw AppError.notFound("Payroll record");
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 }, include: { logoFile: true, activeTemplate: true } });
  const logo = await loadImage(settings.logoFile?.storageKey, settings.logoFile?.mimeType);
  const primary = settings.activeTemplate?.primaryColor ?? "#172554";
  const accent = settings.activeTemplate?.accentColor ?? "#F97316";
  const e = record.employee;
  const period = periodLabel(record.periodYear, record.periodMonth);

  const doc = createDoc(`Payslip ${e.employeeCode} ${period}`, settings.legalName);
  const buffer = await renderToBuffer(doc, () => {
    let y = PAGE.margin;
    if (logo) {
      doc.image(logo, PAGE.margin, y, { fit: [100, 50] });
      y += 56;
    }
    doc.font("Helvetica-Bold").fontSize(18).fillColor(primary).text("PAYSLIP", PAGE.width - PAGE.margin - 250, PAGE.margin, { width: 250, align: "right" });
    body(doc, period, PAGE.width - PAGE.margin - 250, doc.y + 2, { width: 250, align: "right" }, true, 11);
    body(doc, settings.legalName, PAGE.margin, y, { width: 300 }, true, 12);
    body(doc, addressLines([settings.addressLine1, settings.addressLine2, [settings.city, settings.state, settings.postalCode].filter(Boolean).join(", ")]), PAGE.margin, doc.y + 3, { width: 300 }, false, 8.5);
    y = doc.y + 12;
    doc.save().rect(PAGE.margin, y, CONTENT_WIDTH, 2).fill(accent).restore();
    y += 16;

    const details: [string, string][] = [
      ["Employee ID", e.employeeCode],
      ["Name", e.fullName],
      ["Designation", e.designation ?? "-"],
      ["Department", e.department ?? "-"],
      ["Date of joining", formatDisplayDate(e.joiningDate)],
      ["PAN", e.pan ? (maskAccount(e.pan) ?? "-") : "-"],
      ["Bank account", e.bankAccountNumber ? `${e.bankName ?? ""} ${maskAccount(e.bankAccountNumber)}`.trim() : "-"],
      ["Pay period", period],
    ];
    const colWidth = CONTENT_WIDTH / 2;
    details.forEach(([key, value], index) => {
      const x = PAGE.margin + (index % 2) * colWidth;
      const rowY = y + Math.floor(index / 2) * 26;
      label(doc, key, x, rowY);
      body(doc, value, x, rowY + 10, { width: colWidth - 10 }, true, 9.5);
    });
    y += Math.ceil(details.length / 2) * 26 + 10;

    const earnings = record.lines.filter((l) => l.type === "EARNING").map((l) => [l.label, formatAmount(l.amount)] as [string, string]);
    const deductions = record.lines.filter((l) => l.type === "DEDUCTION").map((l) => [l.label, formatAmount(l.amount)] as [string, string]);
    const half = (CONTENT_WIDTH - 16) / 2;
    const leftEnd = table(doc, "Earnings", earnings, "Gross earnings", formatAmount(record.grossEarnings), PAGE.margin, y, half, primary);
    const rightEnd = table(doc, "Deductions", deductions, "Total deductions", formatAmount(record.totalDeductions), PAGE.margin + half + 16, y, half, primary);
    y = Math.max(leftEnd, rightEnd) + 10;

    const adjustments = sum(record.adjustments.map((a) => a.amount));
    doc.save().roundedRect(PAGE.margin, y, CONTENT_WIDTH, 50, 6).fill(COLORS.soft).restore();
    label(doc, "Net pay", PAGE.margin + 14, y + 10);
    doc.font("Helvetica-Bold").fontSize(17).fillColor(COLORS.ink).text(`${settings.currency} ${formatAmount(record.netPay)}`, PAGE.margin + 14, y + 22);
    body(doc, amountInWords(record.netPay.toFixed(2), settings.currency), PAGE.margin + 220, y + 12, { width: CONTENT_WIDTH - 234, align: "right" }, false, 8.5);
    y += 64;

    if (record.adjustments.length > 0) {
      label(doc, "Adjustments after payment", PAGE.margin, y);
      y += 12;
      for (const a of record.adjustments) {
        body(doc, `${formatDisplayDate(a.paidAt ?? a.createdAt)}  ${a.reason}`, PAGE.margin, y, { width: CONTENT_WIDTH - 100 }, false, 8.5);
        body(doc, formatAmount(a.amount), PAGE.width - PAGE.margin - 100, y, { width: 100, align: "right" }, false, 8.5);
        y = doc.y + 4;
      }
      body(doc, "Total paid for this period (net pay + adjustments)", PAGE.margin, y, { width: CONTENT_WIDTH - 100 }, true, 9);
      body(doc, formatAmount(money(record.netPay).plus(adjustments)), PAGE.width - PAGE.margin - 100, y, { width: 100, align: "right" }, true, 9);
      y = doc.y + 12;
    }

    const status = record.status === "PAID"
      ? `Paid on ${formatDisplayDate(record.paidAt)} via ${METHOD_LABEL[record.paymentMethod ?? ""] ?? record.paymentMethod}${record.paymentReference ? ` (ref. ${record.paymentReference})` : ""}`
      : `Status: ${record.status.charAt(0)}${record.status.slice(1).toLowerCase()} (not yet paid)`;
    body(doc, status, PAGE.margin, y, { width: CONTENT_WIDTH }, true, 9);
    y = doc.y + 14;
    hr(doc, y);
    body(
      doc,
      "This is a computer-generated payslip. Deductions shown are as configured by the employer; applicable statutory compliance must be verified independently.",
      PAGE.margin,
      y + 8,
      { width: CONTENT_WIDTH, align: "center" },
      false,
      7.5,
    );

    if (record.status !== "PAID") watermark(doc, record.status === "APPROVED" ? "APPROVED - UNPAID" : "DRAFT", "#D97706");
    footer(doc, settings.activeTemplate?.footerText ?? null);
  });
  return { buffer, fileName: `Payslip-${e.employeeCode}-${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}.pdf` };
}
