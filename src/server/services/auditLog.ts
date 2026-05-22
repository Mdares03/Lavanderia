import "server-only";

import { prisma } from "@/lib/db";

export type AuditEventInput = {
  type: string;
  payload: Record<string, unknown>;
  actorEmployeeId?: string | null;
  deviceId?: string | null;
};

export async function writeAuditEvent(input: AuditEventInput) {
  return prisma.auditEvent.create({
    data: {
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
      actorEmployeeId: input.actorEmployeeId ?? null,
      deviceId: input.deviceId ?? null
    }
  });
}
