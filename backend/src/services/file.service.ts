import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Request, Response } from "express";
import { fileAccess } from "../config/permissions";
import { prisma, type Tx } from "../db/prisma";
import type { FileCategory } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import { storage } from "./storage/storage";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

/** Moves an uploaded temp file into storage and records its metadata. Run inside the owning transaction when possible. */
export async function storeUpload(
  file: Express.Multer.File,
  category: FileCategory,
  uploadedById: string | undefined,
  extra: { creativeAssetId?: string; agreementId?: string; sortOrder?: number; label?: string | null } = {},
  tx: Tx = prisma,
) {
  const now = new Date();
  const key = path.posix.join(
    category.toLowerCase(),
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${randomUUID()}${EXTENSIONS[file.mimetype] ?? ""}`,
  );
  await storage.putFromTempFile(file.path, key, file.mimetype);
  try {
    return await tx.storedFile.create({
      data: {
        category,
        storageKey: key,
        originalName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: uploadedById ?? null,
        ...extra,
      },
    });
  } catch (error) {
    await storage.remove(key);
    throw error;
  }
}

/** Deletes a file's metadata and binary. Callers remove references first (or rely on SetNull). */
export async function deleteStoredFile(fileId: string, tx: Tx = prisma) {
  const file = await tx.storedFile.delete({ where: { id: fileId } }).catch(() => null);
  if (file) await storage.remove(file.storageKey).catch(() => undefined);
}

/** Serves a file after checking the caller's role may access that category of file. */
/** Creative statuses a client may see in the portal. */
export const PORTAL_STATUSES = ["APPROVED", "PUBLISHED"] as const;

export async function sendStoredFile(req: Request, res: Response, fileId: string, download: boolean) {
  const file = await prisma.storedFile.findUnique({
    where: { id: fileId },
    include: { creativeAsset: { select: { clientId: true, status: true } }, contentCalendar: { select: { clientId: true, sharedWithClient: true } } },
  });
  if (!file) throw AppError.notFound("File");
  if (!req.user) throw AppError.unauthorized();
  if (req.user.role === "CLIENT") {
    // Clients only reach their own approved/published creatives and shared content calendars;
    // anything else looks like it does not exist.
    const creative = file.creativeAsset;
    const calendar = file.contentCalendar;
    const allowed =
      (file.category === "CREATIVE" &&
        creative !== null &&
        creative.clientId === req.user.clientId &&
        (PORTAL_STATUSES as readonly string[]).includes(creative.status)) ||
      (file.category === "CONTENT_CALENDAR" && calendar !== null && calendar.sharedWithClient && calendar.clientId === req.user.clientId);
    if (!allowed) throw AppError.notFound("File");
  } else if (!fileAccess[file.category].includes(req.user.role)) {
    throw AppError.forbidden();
  }
  await storage.send(res, file.storageKey, { fileName: file.originalName, mimeType: file.mimeType, download });
}

export function publicFile(file: { id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt?: Date } | null) {
  return file ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: file.createdAt } : null;
}
