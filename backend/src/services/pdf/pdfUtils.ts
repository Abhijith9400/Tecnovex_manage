import PDFDocument from "pdfkit";
import { storage } from "../storage/storage";

export type Doc = PDFKit.PDFDocument;

export const PAGE = { margin: 40, width: 595.28, height: 841.89 };
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
export const COLORS = { ink: "#0F172A", muted: "#64748B", line: "#E2E8F0", soft: "#F8FAFC" };

export function createDoc(title: string, author: string): Doc {
  return new PDFDocument({
    size: "A4",
    margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    info: { Title: title, Author: author, Creator: "Tecnovex Digital" },
  });
}

export function renderToBuffer(doc: Doc, draw: (doc: Doc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/** Loads a PNG/JPEG from storage for embedding; returns null if missing so a PDF still renders. */
export async function loadImage(storageKey: string | null | undefined, mimeType?: string): Promise<Buffer | null> {
  if (!storageKey || (mimeType && !["image/png", "image/jpeg"].includes(mimeType))) return null;
  try {
    return await storage.read(storageKey);
  } catch {
    return null;
  }
}

export function hr(doc: Doc, y: number, color = COLORS.line, x1 = PAGE.margin, x2 = PAGE.width - PAGE.margin) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(0.7).strokeColor(color).stroke().restore();
}

export function label(doc: Doc, text: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.muted).text(text.toUpperCase(), x, y, { characterSpacing: 0.5, ...options });
}

export function body(doc: Doc, text: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}, bold = false, size = 9) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(COLORS.ink).text(text, x, y, options);
}

/** Diagonal watermark (DRAFT / CANCELLED / SAMPLE) on every buffered page. */
export function watermark(doc: Doc, text: string, color = "#DC2626") {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
    doc.font("Helvetica-Bold").fontSize(90).fillColor(color).opacity(0.08);
    doc.text(text, 0, PAGE.height / 2 - 45, { width: PAGE.width, align: "center", lineBreak: false });
    doc.restore();
  }
}

/** Footer text and "Page x of y" on every page. */
export function footer(doc: Doc, text: string | null) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would trigger an automatic page break, so lift the margin temporarily.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - PAGE.margin + 8;
    hr(doc, y - 6);
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted);
    if (text) doc.text(text, PAGE.margin, y, { width: CONTENT_WIDTH - 70, lineBreak: false, ellipsis: true });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE.width - PAGE.margin - 70, y, { width: 70, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

/** Starts a new page when fewer than `needed` points remain above the footer. Returns the y to continue at. */
export function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed > PAGE.height - PAGE.margin - 24) {
    doc.addPage();
    return PAGE.margin;
  }
  return y;
}

export function addressLines(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join("\n");
}
