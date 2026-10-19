import { prisma } from "../../db/prisma";
import { AppError } from "../../utils/AppError";
import { amountInWords } from "../../utils/amountInWords";
import { formatDisplayDate } from "../../utils/dates";
import { formatAmount, money } from "../../utils/money";
import { addressLines, body, COLORS, CONTENT_WIDTH, createDoc, footer, hr, label, loadImage, PAGE, renderToBuffer, watermark } from "./pdfUtils";

const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", UPI: "UPI", CASH: "Cash", CHEQUE: "Cheque", CARD: "Card", OTHER: "Other" };

/** Payment receipt generated from the saved payment record. */
export async function renderReceiptPdf(paymentId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { client: true, invoice: { select: { invoiceNumber: true, total: true, amountPaid: true, currency: true } } },
  });
  if (!payment) throw AppError.notFound("Payment");
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 }, include: { logoFile: true, activeTemplate: true } });
  const logo = await loadImage(settings.logoFile?.storageKey, settings.logoFile?.mimeType);
  const primary = settings.activeTemplate?.primaryColor ?? "#172554";
  const accent = settings.activeTemplate?.accentColor ?? "#F97316";
  const currency = payment.invoice?.currency ?? settings.currency;

  const doc = createDoc(`Receipt ${payment.receiptNumber}`, settings.legalName);
  const buffer = await renderToBuffer(doc, () => {
    let y = PAGE.margin;
    if (logo) {
      doc.image(logo, PAGE.margin, y, { fit: [100, 50] });
      y += 56;
    }
    doc.font("Helvetica-Bold").fontSize(20).fillColor(primary).text("PAYMENT RECEIPT", PAGE.width - PAGE.margin - 250, PAGE.margin, { width: 250, align: "right" });
    body(doc, settings.tradingName || settings.legalName, PAGE.margin, y, { width: 280 }, true, 12);
    body(
      doc,
      addressLines([
        settings.addressLine1,
        settings.addressLine2,
        [settings.city, settings.state, settings.postalCode].filter(Boolean).join(", "),
        settings.isGstRegistered && settings.gstin ? `GSTIN: ${settings.gstin}` : null,
        settings.pan ? `PAN: ${settings.pan}` : null,
        [settings.phone, settings.email].filter(Boolean).join("  |  "),
      ]),
      PAGE.margin,
      doc.y + 3,
      { width: 280 },
      false,
      8.5,
    );
    y = doc.y + 12;
    doc.save().rect(PAGE.margin, y, CONTENT_WIDTH, 2).fill(accent).restore();
    y += 18;

    const rows: [string, string][] = [
      ["Receipt no.", payment.receiptNumber],
      ["Payment date", formatDisplayDate(payment.paymentDate)],
      ["Received from", payment.client.name],
      ["Payment method", METHOD_LABEL[payment.method] ?? payment.method],
      ["Transaction reference", payment.reference ?? "-"],
      ["Against invoice", payment.invoice?.invoiceNumber ?? "On account (not linked to an invoice)"],
    ];
    for (const [key, value] of rows) {
      label(doc, key, PAGE.margin, y + 1, { width: 150 });
      body(doc, value, PAGE.margin + 160, y, { width: CONTENT_WIDTH - 160 }, true, 10);
      y = doc.y + 8;
    }

    y += 6;
    doc.save().roundedRect(PAGE.margin, y, CONTENT_WIDTH, 54, 6).fill(COLORS.soft).restore();
    label(doc, "Amount received", PAGE.margin + 14, y + 10);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.ink).text(`${currency} ${formatAmount(payment.amount)}`, PAGE.margin + 14, y + 24);
    body(doc, amountInWords(payment.amount.toFixed(2), currency), PAGE.margin + 230, y + 14, { width: CONTENT_WIDTH - 244, align: "right" }, false, 8.5);
    y += 70;

    if (payment.invoice) {
      const balance = money(payment.invoice.total).minus(payment.invoice.amountPaid);
      body(
        doc,
        `Invoice total: ${currency} ${formatAmount(payment.invoice.total)}   |   Total received to date: ${currency} ${formatAmount(payment.invoice.amountPaid)}   |   Balance: ${currency} ${formatAmount(balance)}`,
        PAGE.margin,
        y,
        { width: CONTENT_WIDTH },
        false,
        8.5,
      );
      y = doc.y + 10;
    }
    if (payment.notes) {
      label(doc, "Notes", PAGE.margin, y);
      body(doc, payment.notes, PAGE.margin, y + 11, { width: CONTENT_WIDTH }, false, 8.5);
      y = doc.y + 10;
    }
    hr(doc, y + 10);
    body(doc, "This is a computer-generated receipt and does not require a signature.", PAGE.margin, y + 18, { width: CONTENT_WIDTH, align: "center" }, false, 8);

    if (payment.status === "VOIDED") watermark(doc, "VOID");
    footer(doc, settings.activeTemplate?.footerText ?? null);
  });
  return { buffer, fileName: `${payment.receiptNumber}.pdf` };
}
