import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Messages "sent" without SMTP (development and tests), newest last. Never used in production. */
export const devOutbox: OutgoingMail[] = [];

let transporter: Transporter | null = null;

function smtp(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export function isMailConfigured() {
  return Boolean(env.SMTP_HOST);
}

/**
 * Sends an email through SMTP. Without SMTP configured, development and tests print the message to the
 * server console instead (so OTP sign-in still works locally); production refuses, so codes are never lost.
 */
export async function sendMail(mail: OutgoingMail) {
  const transport = smtp();
  if (!transport) {
    if (env.isProduction) throw new AppError(503, "Email is not configured on the server. Ask the administrator to set the SMTP settings.", "MAIL_NOT_CONFIGURED");
    devOutbox.push(mail);
    if (env.NODE_ENV !== "test") {
      console.log(`\n----- EMAIL (not sent: SMTP not configured) -----\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n--------------------------------------------------\n`);
    }
    return;
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
  } catch (error) {
    console.error("Email send failed:", error);
    throw new AppError(502, "We couldn't send the email right now. Please try again in a minute.", "MAIL_SEND_FAILED");
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const WORDING = {
  LOGIN: {
    subject: (code: string, company: string) => `${code} is your ${company} sign-in code`,
    heading: "Your sign-in code",
    intro: "use this code to finish signing in:",
    textIntro: "Your sign-in code is",
    warning: "If you didn't try to sign in, someone may know your password. Change it under Settings > My account, or tell your administrator.",
    warningHtml: "Didn't try to sign in? Someone may know your password. Change it under <b>Settings › My account</b> or tell your administrator.",
  },
  PASSWORD_RESET: {
    subject: (code: string, company: string) => `${code} is your ${company} password reset code`,
    heading: "Reset your password",
    intro: "use this code to set a new password:",
    textIntro: "Your password reset code is",
    warning: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    warningHtml: "Didn't ask to reset your password? You can ignore this email. Your password stays the same.",
  },
} as const;

/** Branded one-time code email (plain text + simple, email-client-safe HTML) for sign-in or password reset. */
export function otpEmail(params: {
  name: string;
  code: string;
  minutes: number;
  companyName: string;
  ip: string | null;
  purpose?: "LOGIN" | "PASSWORD_RESET";
}): Pick<OutgoingMail, "subject" | "text" | "html"> {
  const { name, code, minutes, companyName, ip } = params;
  const w = WORDING[params.purpose ?? "LOGIN"];
  const subject = w.subject(code, companyName);
  const text = [
    `Hi ${name},`,
    "",
    `${w.textIntro}: ${code}`,
    "",
    `It expires in ${minutes} minutes and can be used once.`,
    ip ? `Requested from IP address ${ip}.` : "",
    "",
    w.warning,
    "",
    companyName,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
    <tr><td style="padding:24px 28px 8px">
      <p style="margin:0 0 4px;font-size:13px;color:#64748b">${escape(companyName)}</p>
      <h1 style="margin:0 0 16px;font-size:20px">${w.heading}</h1>
      <p style="margin:0 0 16px;font-size:14px">Hi ${escape(name)}, ${w.intro}</p>
      <p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:10px;color:#f97316">${code}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b">It expires in ${minutes} minutes and can only be used once.${ip ? ` Requested from ${escape(ip)}.` : ""}</p>
      <p style="margin:16px 0 24px;font-size:13px;color:#64748b">${w.warningHtml}</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}
