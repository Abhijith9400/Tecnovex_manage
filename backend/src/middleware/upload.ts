import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { open, rm } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "express";
import multer from "multer";
import { env } from "../config/env";
import { FileCategory } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";

const MB = 1024 * 1024;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO = ["video/mp4", "video/quicktime", "video/webm"];
const PDF = ["application/pdf"];
const DOCX = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const XLSX = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

const rules: Record<FileCategory, { types: string[]; maxBytes: number; maxFiles: number }> = {
  CREATIVE: { types: [...IMAGE, ...VIDEO], maxBytes: env.MAX_UPLOAD_MB * MB, maxFiles: 20 },
  AGREEMENT: { types: [...PDF, ...DOCX, "image/jpeg", "image/png"], maxBytes: 25 * MB, maxFiles: 10 },
  PAYMENT_PROOF: { types: [...PDF, "image/jpeg", "image/png", "image/webp"], maxBytes: 10 * MB, maxFiles: 1 },
  EXPENSE_RECEIPT: { types: [...PDF, "image/jpeg", "image/png", "image/webp"], maxBytes: 10 * MB, maxFiles: 1 },
  INCOME_ATTACHMENT: { types: [...PDF, "image/jpeg", "image/png", "image/webp"], maxBytes: 10 * MB, maxFiles: 1 },
  // PDFKit can only embed PNG and JPEG.
  BRANDING: { types: ["image/png", "image/jpeg"], maxBytes: 5 * MB, maxFiles: 1 },
  CONTENT_CALENDAR: { types: [...PDF, ...XLSX, ...DOCX, "image/jpeg", "image/png", "image/webp"], maxBytes: 25 * MB, maxFiles: 1 },
};

const tempDir = path.resolve(env.UPLOAD_DIR, "tmp");
mkdirSync(tempDir, { recursive: true });

/** Checks the file's leading bytes so a renamed executable cannot pass as an image or PDF. */
async function sniffMatches(filePath: string, mimeType: string): Promise<boolean> {
  const handle = await open(filePath, "r");
  const buffer = Buffer.alloc(16);
  try {
    await handle.read(buffer, 0, 16, 0);
  } finally {
    await handle.close();
  }
  const hex = buffer.toString("hex");
  const ascii = buffer.toString("latin1");
  switch (mimeType) {
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/png":
      return hex.startsWith("89504e470d0a1a0a");
    case "image/gif":
      return ascii.startsWith("GIF8");
    case "image/webp":
      return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
    case "application/pdf":
      return ascii.startsWith("%PDF");
    case "video/mp4":
    case "video/quicktime":
      return ascii.slice(4, 8) === "ftyp" || ascii.slice(4, 8) === "moov" || ascii.slice(4, 8) === "wide" || ascii.slice(4, 8) === "mdat";
    case "video/webm":
      return hex.startsWith("1a45dfa3");
    case DOCX[0]:
    case XLSX[0]:
      // Office files are ZIP containers.
      return hex.startsWith("504b0304");
    default:
      return false;
  }
}

/**
 * Multer streams each part straight to a temp file on disk (never into memory), then each file is
 * content-sniffed. Services move accepted files into storage; unhandled temp files are removed.
 */
export function upload(category: FileCategory, field: string, multiple = false, allowedTypes?: string[]): RequestHandler {
  const rule = { ...rules[category], ...(allowedTypes ? { types: allowedTypes } : {}) };
  const handler = multer({
    storage: multer.diskStorage({
      destination: tempDir,
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { fileSize: rule.maxBytes, files: multiple ? rule.maxFiles : 1, fields: 50 },
    fileFilter: (_req, file, cb) => {
      if (!rule.types.includes(file.mimetype)) {
        cb(AppError.badRequest(`File type ${file.mimetype || "unknown"} is not allowed for this upload`));
        return;
      }
      cb(null, true);
    },
  });
  const parse = multiple ? handler.array(field, rule.maxFiles) : handler.single(field);

  return (req, res, next) => {
    parse(req, res, async (error: unknown) => {
      const files = uploadedFiles(req);
      const cleanup = () => Promise.all(files.map((f) => rm(f.path, { force: true })));
      if (error) {
        await cleanup();
        if (error instanceof multer.MulterError) {
          const message =
            error.code === "LIMIT_FILE_SIZE"
              ? `File is too large. Maximum size is ${Math.round(rule.maxBytes / MB)} MB.`
              : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
                ? `Too many files or unexpected field. Upload up to ${rule.maxFiles} file(s) in "${field}".`
                : error.message;
          return next(AppError.badRequest(message));
        }
        return next(error);
      }
      for (const file of files) {
        if (!(await sniffMatches(file.path, file.mimetype))) {
          await cleanup();
          return next(AppError.badRequest(`"${file.originalname}" does not look like a valid ${file.mimetype} file`));
        }
      }
      // Always delete leftovers once the response is done (moved files are already gone).
      res.on("close", () => void cleanup());
      next();
    });
  };
}

export function uploadedFiles(req: Express.Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) return req.files;
  return req.file ? [req.file] : [];
}
