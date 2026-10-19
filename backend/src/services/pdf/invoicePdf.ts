import { prisma } from "../../db/prisma";
import type { InvoiceLayout } from "../../generated/prisma/enums";
import { AppError } from "../../utils/AppError";
import { amountInWords } from "../../utils/amountInWords";
import { formatDisplayDate, parsePeriod, periodLabel } from "../../utils/dates";
import { formatAmount, money } from "../../utils/money";
import type { CompanySnapshot } from "../invoice.service";
import { addressLines, body, COLORS, CONTENT_WIDTH, createDoc, type Doc, ensureSpace, footer, hr, label, loadImage, PAGE, renderToBuffer, watermark } from "./pdfUtils";

export interface InvoicePdfData {
  invoice: {
    invoiceNumber: string | null;
    status: string;
    issueDate: Date;
    dueDate: Date;
    billingPeriod: string | null;
    currency: string;
    billToName: string;
    billToAddress: string | null;
    billToEmail: string | null;
    billToGstin: string | null;
    billToPan: string | null;
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    total: string;
    amountPaid: string;
    notes: string | null;
    terms: string | null;
  };
  items: { description: string; sacCode: string | null; quantity: string; unitPrice: string; discount: string; taxRate: string; taxableAmount: string; taxAmount: string; lineTotal: string }[];
  company: CompanySnapshot;
  template: {
    layout: InvoiceLayout;
    primaryColor: string;
    accentColor: string;
    headerText: string | null;
    footerText: string | null;
    termsText: string | null;
    showLogo: boolean;
    showBankDetails: boolean;
    showSignature: boolean;
    signatureLabel: string;
  };
  logo: Buffer | null;
  signature: Buffer | null;
  watermark?: string;
}

const DEFAULT_TEMPLATE: InvoicePdfData["template"] = {
  layout: "CLASSIC",
  primaryColor: "#172554",
  accentColor: "#F97316",
  headerText: null,
  footerText: null,
  termsText: null,
  showLogo: true,
  showBankDetails: true,
  showSignature: true,
  signatureLabel: "Authorised Signatory",
};

async function loadTemplate(templateId: string | null) {
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 }, include: { logoFile: true } });
  const id = templateId ?? settings.activeTemplateId;
  const template = id ? await prisma.invoiceTemplate.findUnique({ where: { id }, include: { signatureFile: true } }) : null;
  return { settings, template };
}

function snapshotFromSettings(s: Awaited<ReturnType<typeof loadTemplate>>["settings"]): CompanySnapshot {
  return {
    legalName: s.legalName,
    tradingName: s.tradingName,
    addressLine1: s.addressLine1,
    addressLine2: s.addressLine2,
    city: s.city,
    state: s.state,
    postalCode: s.postalCode,
    country: s.country,
    email: s.email,
    phone: s.phone,
    website: s.website,
    pan: s.pan,
    isGstRegistered: s.isGstRegistered,
    gstin: s.gstin,
    taxLabel: s.taxLabel,
    splitTaxOnInvoice: s.splitTaxOnInvoice,
    otherTaxInfo: s.otherTaxInfo,
    bankName: s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNumber: s.bankAccountNumber,
    bankIfsc: s.bankIfsc,
    bankBranch: s.bankBranch,
    upiId: s.upiId,
  };
}

/** Loads exactly the saved invoice. Issued invoices use the company details frozen at issue time. */
export async function loadInvoicePdfData(invoiceId: string): Promise<InvoicePdfData> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!invoice) throw AppError.notFound("Invoice");
  const { settings, template } = await loadTemplate(invoice.templateId);
  const company = (invoice.companySnapshot as CompanySnapshot | null) ?? snapshotFromSettings(settings);

  return {
    invoice: {
      ...invoice,
      subtotal: invoice.subtotal.toFixed(2),
      discountTotal: invoice.discountTotal.toFixed(2),
      taxTotal: invoice.taxTotal.toFixed(2),
      total: invoice.total.toFixed(2),
      amountPaid: invoice.amountPaid.toFixed(2),
    },
    items: invoice.items.map((i) => ({
      description: i.description,
      sacCode: i.sacCode,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toFixed(2),
      discount: i.discount.toFixed(2),
      taxRate: i.taxRate.toString(),
      taxableAmount: i.taxableAmount.toFixed(2),
      taxAmount: i.taxAmount.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2),
    })),
    company,
    template: template ?? DEFAULT_TEMPLATE,
    logo: await loadImage(settings.logoFile?.storageKey, settings.logoFile?.mimeType),
    signature: await loadImage(template?.signatureFile?.storageKey, template?.signatureFile?.mimeType),
    watermark: invoice.status === "DRAFT" ? "DRAFT" : invoice.status === "CANCELLED" ? "CANCELLED" : undefined,
  };
}

/** Sample data for previewing a template. Always watermarked SAMPLE; never used for a real invoice download. */
export async function loadTemplatePreviewData(templateId: string): Promise<InvoicePdfData> {
  const { settings, template } = await loadTemplate(templateId);
  if (!template) throw AppError.notFound("Template");
  const rate = settings.isGstRegistered ? "18" : "0";
  const sampleLines = [
    { description: "Social media management (sample)", sacCode: "998361", quantity: "1", unitPrice: "30000.00", discount: "0.00" },
    { description: "Reel production (sample)", sacCode: "998361", quantity: "4", unitPrice: "2500.00", discount: "1000.00" },
  ];
  const items = sampleLines.map((l) => {
    const taxable = money(l.quantity).times(l.unitPrice).minus(l.discount);
    const tax = taxable.times(rate).dividedBy(100).toDecimalPlaces(2);
    return { ...l, taxRate: rate, taxableAmount: taxable.toFixed(2), taxAmount: tax.toFixed(2), lineTotal: taxable.plus(tax).toFixed(2) };
  });
  const subtotal = items.reduce((s, i) => s.plus(money(i.quantity).times(i.unitPrice)), money(0));
  const taxTotal = items.reduce((s, i) => s.plus(i.taxAmount), money(0));
  const discountTotal = items.reduce((s, i) => s.plus(i.discount), money(0));
  const total = subtotal.minus(discountTotal).plus(taxTotal);
  const today = new Date();
  return {
    invoice: {
      invoiceNumber: `${settings.invoicePrefix}-SAMPLE`,
      status: "ISSUED",
      issueDate: today,
      dueDate: new Date(today.getTime() + settings.defaultPaymentTermsDays * 86_400_000),
      billingPeriod: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`,
      currency: settings.currency,
      billToName: "Sample Client Pvt Ltd",
      billToAddress: "1 Example Road\nPune, Maharashtra 411001\nIndia",
      billToEmail: "accounts@client.example.com",
      billToGstin: null,
      billToPan: null,
      subtotal: subtotal.toFixed(2),
      discountTotal: discountTotal.toFixed(2),
      taxTotal: taxTotal.toFixed(2),
      total: total.toFixed(2),
      amountPaid: "0.00",
      notes: settings.invoiceNotes,
      terms: settings.paymentTermsText,
    },
    items,
    company: snapshotFromSettings(settings),
    template,
    logo: await loadImage(settings.logoFile?.storageKey, settings.logoFile?.mimeType),
    signature: await loadImage(template.signatureFile?.storageKey, template.signatureFile?.mimeType),
    watermark: "SAMPLE",
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function companyAddress(c: CompanySnapshot) {
  return addressLines([c.addressLine1, c.addressLine2, [c.city, c.state, c.postalCode].filter(Boolean).join(", "), c.country]);
}

function companyIds(c: CompanySnapshot) {
  return addressLines([
    c.isGstRegistered && c.gstin ? `GSTIN: ${c.gstin}` : null,
    c.pan ? `PAN: ${c.pan}` : null,
    c.otherTaxInfo,
    [c.phone, c.email].filter(Boolean).join("  |  "),
    c.website,
  ]);
}

function drawHeader(doc: Doc, data: InvoicePdfData): number {
  const { company: c, template: t, invoice } = data;
  const title = c.isGstRegistered && money(invoice.taxTotal).greaterThan(0) ? "TAX INVOICE" : "INVOICE";
  const right = PAGE.width - PAGE.margin;
  const metaX = right - 200;

  if (t.layout === "MODERN") {
    doc.save().rect(0, 0, PAGE.width, 110).fill(t.primaryColor).restore();
    let x = PAGE.margin;
    if (t.showLogo && data.logo) {
      doc.save().roundedRect(PAGE.margin, 25, 64, 60, 6).fill("#FFFFFF").restore();
      doc.image(data.logo, PAGE.margin + 4, 29, { fit: [56, 52], align: "center", valign: "center" });
      x += 78;
    }
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#FFFFFF").text(c.tradingName || c.legalName, x, 34, { width: 280 });
    if (c.tradingName) doc.font("Helvetica").fontSize(8).fillColor("#FFFFFF").text(c.legalName, x, doc.y + 2, { width: 280 });
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#FFFFFF").text(title, metaX, 34, { width: 200, align: "right" });
    if (t.headerText) doc.font("Helvetica").fontSize(8.5).fillColor("#FFFFFF").text(t.headerText, metaX - 60, 62, { width: 260, align: "right" });
    let y = 125;
    body(doc, companyAddress(c), PAGE.margin, y, { width: 260 }, false, 8.5);
    const afterAddress = doc.y;
    body(doc, companyIds(c), PAGE.margin, afterAddress + 2, { width: 260 }, false, 8);
    y = Math.max(doc.y, 125);
    return y + 14;
  }

  let y = PAGE.margin;
  let textX = PAGE.margin;
  if (t.showLogo && data.logo) {
    doc.image(data.logo, PAGE.margin, y, { fit: [110, 60] });
    if (t.layout === "MINIMAL") {
      y += 66;
    } else {
      textX = PAGE.margin;
      y += 66;
    }
  }
  const titleColor = t.layout === "MINIMAL" ? COLORS.ink : t.primaryColor;
  doc.font("Helvetica-Bold").fontSize(t.layout === "MINIMAL" ? 16 : 22).fillColor(titleColor).text(title, metaX, PAGE.margin, { width: 200, align: "right" });
  if (t.headerText) doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(t.headerText, metaX - 60, doc.y + 2, { width: 260, align: "right" });

  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.ink).text(c.tradingName || c.legalName, textX, y, { width: 280 });
  if (c.tradingName) doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted).text(c.legalName, textX, doc.y + 1, { width: 280 });
  body(doc, companyAddress(c), textX, doc.y + 3, { width: 280 }, false, 8.5);
  body(doc, companyIds(c), textX, doc.y + 2, { width: 280 }, false, 8);
  y = doc.y + 12;
  if (t.layout === "CLASSIC") {
    doc.save().rect(PAGE.margin, y, CONTENT_WIDTH, 2).fill(t.accentColor).restore();
  } else {
    hr(doc, y, COLORS.ink);
  }
  return y + 14;
}

function drawParties(doc: Doc, data: InvoicePdfData, startY: number): number {
  const { invoice } = data;
  const left = PAGE.margin;
  const metaX = PAGE.width - PAGE.margin - 210;
  label(doc, "Bill to", left, startY);
  body(doc, invoice.billToName, left, startY + 12, { width: 260 }, true, 10);
  body(doc, invoice.billToAddress ?? "", left, doc.y + 2, { width: 260 }, false, 8.5);
  const ids = addressLines([invoice.billToGstin ? `GSTIN: ${invoice.billToGstin}` : null, invoice.billToPan ? `PAN: ${invoice.billToPan}` : null, invoice.billToEmail]);
  if (ids) body(doc, ids, left, doc.y + 2, { width: 260 }, false, 8);
  const leftEnd = doc.y;

  const meta: [string, string][] = [
    ["Invoice no.", invoice.invoiceNumber ?? "Draft (number assigned on issue)"],
    ["Invoice date", formatDisplayDate(invoice.issueDate)],
    ["Due date", formatDisplayDate(invoice.dueDate)],
  ];
  if (invoice.billingPeriod) {
    const { year, month } = parsePeriod(invoice.billingPeriod);
    meta.push(["Billing period", periodLabel(year, month)]);
  }
  let y = startY;
  for (const [key, value] of meta) {
    label(doc, key, metaX, y + 1, { width: 80 });
    body(doc, value, metaX + 85, y, { width: 125, align: "right" }, true, 9);
    y = Math.max(doc.y, y + 12) + 3;
  }
  return Math.max(leftEnd, y) + 16;
}

const columns = [
  { key: "#", width: 22, align: "left" as const },
  { key: "Description", width: 205, align: "left" as const },
  { key: "Qty", width: 38, align: "right" as const },
  { key: "Rate", width: 72, align: "right" as const },
  { key: "Discount", width: 58, align: "right" as const },
  { key: "Tax %", width: 40, align: "right" as const },
  { key: "Amount", width: 80, align: "right" as const },
];

function drawTableHeader(doc: Doc, data: InvoicePdfData, y: number): number {
  const minimal = data.template.layout === "MINIMAL";
  if (!minimal) doc.save().rect(PAGE.margin, y, CONTENT_WIDTH, 20).fill(data.template.primaryColor).restore();
  let x = PAGE.margin;
  for (const col of columns) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(minimal ? COLORS.muted : "#FFFFFF").text(col.key.toUpperCase(), x + 4, y + 6, { width: col.width - 8, align: col.align });
    x += col.width;
  }
  if (minimal) hr(doc, y + 20, COLORS.ink);
  return y + 24;
}

function drawItems(doc: Doc, data: InvoicePdfData, startY: number): number {
  let y = drawTableHeader(doc, data, startY);
  data.items.forEach((item, index) => {
    const description = item.sacCode ? `${item.description}\nSAC: ${item.sacCode}` : item.description;
    doc.font("Helvetica").fontSize(8.5);
    const rowHeight = Math.max(doc.heightOfString(description, { width: columns[1].width - 8 }), 10) + 10;
    if (y + rowHeight > PAGE.height - PAGE.margin - 30) {
      doc.addPage();
      y = drawTableHeader(doc, data, PAGE.margin);
    }
    if (index % 2 === 1 && data.template.layout !== "MINIMAL") doc.save().rect(PAGE.margin, y - 3, CONTENT_WIDTH, rowHeight).fill(COLORS.soft).restore();
    const values = [
      String(index + 1),
      description,
      item.quantity,
      formatAmount(item.unitPrice),
      money(item.discount).isZero() ? "-" : formatAmount(item.discount),
      `${item.taxRate}%`,
      formatAmount(item.taxableAmount),
    ];
    let x = PAGE.margin;
    columns.forEach((col, i) => {
      doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.ink).text(values[i], x + 4, y + 2, { width: col.width - 8, align: col.align });
      x += col.width;
    });
    y += rowHeight;
    hr(doc, y - 3);
  });
  return y + 6;
}

function drawTotals(doc: Doc, data: InvoicePdfData, startY: number): number {
  const { invoice, company: c, template: t } = data;
  let y = ensureSpace(doc, startY, 150);
  const x = PAGE.width - PAGE.margin - 230;
  const currency = invoice.currency;
  const rows: [string, string, boolean?][] = [["Subtotal", formatAmount(invoice.subtotal)]];
  if (money(invoice.discountTotal).greaterThan(0)) rows.push(["Discount", `- ${formatAmount(invoice.discountTotal)}`]);
  rows.push(["Taxable amount", formatAmount(money(invoice.subtotal).minus(invoice.discountTotal))]);
  if (money(invoice.taxTotal).greaterThan(0)) {
    if (c.splitTaxOnInvoice) {
      // Tax shown as two equal halves (e.g. CGST + SGST); any odd paisa goes to the second half.
      const half = money(invoice.taxTotal).dividedBy(2).toDecimalPlaces(2, 1);
      rows.push(["CGST", formatAmount(half)], ["SGST", formatAmount(money(invoice.taxTotal).minus(half))]);
    } else {
      rows.push([c.taxLabel || "Tax", formatAmount(invoice.taxTotal)]);
    }
  }
  for (const [key, value] of rows) {
    body(doc, key, x, y, { width: 120 }, false, 9);
    body(doc, value, x + 120, y, { width: 110, align: "right" }, false, 9);
    y += 15;
  }
  doc.save().rect(x - 6, y - 3, 236, 22).fill(t.layout === "MINIMAL" ? COLORS.soft : t.accentColor).restore();
  const totalColor = t.layout === "MINIMAL" ? COLORS.ink : "#FFFFFF";
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(totalColor).text(`Total (${currency})`, x, y + 3, { width: 120 });
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(totalColor).text(formatAmount(invoice.total), x + 120, y + 3, { width: 104, align: "right" });
  y += 28;
  if (money(invoice.amountPaid).greaterThan(0)) {
    body(doc, "Amount paid", x, y, { width: 120 }, false, 9);
    body(doc, formatAmount(invoice.amountPaid), x + 120, y, { width: 110, align: "right" }, false, 9);
    y += 15;
    body(doc, "Balance due", x, y, { width: 120 }, true, 9.5);
    body(doc, formatAmount(money(invoice.total).minus(invoice.amountPaid)), x + 120, y, { width: 110, align: "right" }, true, 9.5);
    y += 15;
  }

  label(doc, "Amount in words", PAGE.margin, startY);
  body(doc, amountInWords(invoice.total, currency), PAGE.margin, startY + 11, { width: 250 }, false, 8.5);
  return Math.max(y, doc.y) + 14;
}

function drawFooterBlocks(doc: Doc, data: InvoicePdfData, startY: number): number {
  const { company: c, template: t, invoice } = data;
  let y = ensureSpace(doc, startY, 120);
  const blockTop = y;

  if (t.showBankDetails && (c.bankAccountNumber || c.upiId)) {
    label(doc, "Bank details", PAGE.margin, y);
    const bank = addressLines([
      c.bankAccountName ? `Account name: ${c.bankAccountName}` : null,
      c.bankName ? `Bank: ${c.bankName}${c.bankBranch ? `, ${c.bankBranch}` : ""}` : null,
      c.bankAccountNumber ? `Account no.: ${c.bankAccountNumber}` : null,
      c.bankIfsc ? `IFSC: ${c.bankIfsc}` : null,
      c.upiId ? `UPI: ${c.upiId}` : null,
    ]);
    body(doc, bank, PAGE.margin, y + 11, { width: 270 }, false, 8.5);
    y = doc.y;
  }

  if (t.showSignature) {
    const sx = PAGE.width - PAGE.margin - 180;
    body(doc, `For ${c.legalName}`, sx, blockTop, { width: 180, align: "right" }, true, 8.5);
    if (data.signature) doc.image(data.signature, sx + 60, blockTop + 16, { fit: [120, 45], align: "right" });
    hr(doc, blockTop + 68, COLORS.muted, sx + 30, sx + 180);
    body(doc, t.signatureLabel, sx, blockTop + 72, { width: 180, align: "right" }, false, 8);
    y = Math.max(y, blockTop + 86);
  }
  y += 14;

  const notes = invoice.notes;
  const terms = invoice.terms ?? t.termsText;
  for (const [title, text] of [
    ["Notes", notes],
    ["Terms & conditions", terms && t.termsText && invoice.terms !== t.termsText ? `${terms}\n${t.termsText}` : terms],
  ] as const) {
    if (!text) continue;
    y = ensureSpace(doc, y, 40);
    label(doc, title, PAGE.margin, y);
    body(doc, text, PAGE.margin, y + 11, { width: CONTENT_WIDTH }, false, 8);
    y = doc.y + 10;
  }
  return y;
}

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = createDoc(`Invoice ${data.invoice.invoiceNumber ?? "draft"}`, data.company.legalName);
  return renderToBuffer(doc, () => {
    let y = drawHeader(doc, data);
    y = drawParties(doc, data, y);
    y = drawItems(doc, data, y);
    y = drawTotals(doc, data, y);
    drawFooterBlocks(doc, data, y);
    if (data.watermark) watermark(doc, data.watermark);
    footer(doc, data.template.footerText);
  });
}
