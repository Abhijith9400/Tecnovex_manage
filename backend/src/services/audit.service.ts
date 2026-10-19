import type { Request } from "express";
import { prisma, type Prisma, type Tx } from "../db/prisma";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  clientId?: string | null;
  changes?: Prisma.InputJsonValue;
}

/** Records who did what. Pass the transaction client so the log commits or rolls back with the change. */
export async function audit(req: Request | null, entry: AuditEntry, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      ...entry,
      clientId: entry.clientId ?? null,
      userId: req?.user?.id ?? null,
      ipAddress: req?.ip ?? null,
    },
  });
}

/** Returns only the fields that changed, for compact audit records. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Prisma.InputJsonValue {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (String(from ?? "") !== String(to ?? "")) {
      changes[key] = { from: from === undefined ? null : String(from ?? ""), to: to === undefined ? null : String(to ?? "") };
    }
  }
  return changes as Prisma.InputJsonValue;
}
