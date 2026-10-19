import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { Prisma } from "../db/prisma";
import { AppError } from "../utils/AppError";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`, "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.issues },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ success: false, error: { code: "CONFLICT", message: "A record with these details already exists" } });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      return;
    }
  }

  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON body" } });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: env.isProduction ? "Something went wrong" : String(err?.message ?? err),
    },
  });
};
