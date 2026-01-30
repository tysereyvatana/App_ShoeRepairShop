import type { PrismaClient } from "@prisma/client";

/**
 * Lightweight audit logging.
 *
 * Notes:
 * - Stores metaJson as a JSON string (keep payloads small).
 * - Can be called with `app.prisma` or inside a transaction using `tx`.
 */
export async function writeAudit(
  tx: Pick<PrismaClient, "auditLog">,
  args: {
    userId: string | null;
    action: string;
    entity?: string | null;
    entityId?: string | null;
    meta?: any;
  }
) {
  const metaJson = args.meta !== undefined ? safeStringify(args.meta) : null;

  await tx.auditLog.create({
    data: {
      userId: args.userId,
      action: args.action,
      entity: args.entity ?? null,
      entityId: args.entityId ?? null,
      metaJson,
    },
  });
}

export function safeStringify(meta: any): string {
  try {
    // Avoid crashing on BigInt / circular refs, keep it readable.
    return JSON.stringify(meta);
  } catch {
    try {
      return JSON.stringify({ note: "metaJson stringify failed" });
    } catch {
      return "{}";
    }
  }
}
