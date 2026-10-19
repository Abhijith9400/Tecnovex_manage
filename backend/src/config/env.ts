import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /** Proxies in front of the API (Render = 1; Vercel rewrite + Render = 2), so req.ip is the visitor's address. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  /** Use "none" (with HTTPS) only when frontend and API are on different sites. */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(500),
  /** Email OTP at sign-in (two-step verification). Set to "false" to sign in with password only. */
  LOGIN_OTP_ENABLED: z.enum(["true", "false"]).default("true"),
  /** SMTP for outgoing email. If SMTP_HOST is empty, development prints emails to the console instead. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Tecnovex Digital <no-reply@example.com>"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
  isProduction: parsed.data.NODE_ENV === "production",
};
