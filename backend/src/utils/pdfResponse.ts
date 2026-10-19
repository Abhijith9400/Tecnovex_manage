import type { Response } from "express";

export function sendPdf(res: Response, buffer: Buffer, fileName: string, download: boolean) {
  const safeName = fileName.replace(/[^\w.-]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safeName}"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
}
