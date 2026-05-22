import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { writeAuditEvent } from "@/server/services/auditLog";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  downtimeThresholdMinutes: z.number().int().min(1).max(60).optional(),
  voidSpikePercentThreshold: z.number().int().min(1).max(100).optional(),
  voidSpikeAmountCents: z.number().int().min(0).max(5_000_000).optional(),
  cashVarianceApprovalThresholdCents: z.number().int().min(0).max(500_000).optional(),
  cashDrawerCapCents: z.number().int().min(10_000).max(5_000_000).optional(),
  cashDrawerSoftWarningPct: z.number().int().min(1).max(99).optional(),
  cashDropResidualCents: z.number().int().min(0).max(1_000_000).optional()
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: {
        downtimeThresholdMinutes: true,
        voidSpikePercentThreshold: true,
        voidSpikeAmountCents: true,
        cashVarianceApprovalThresholdCents: true,
        cashDrawerCapCents: true,
        cashDrawerSoftWarningPct: true,
        cashDropResidualCents: true
      }
    });
    return ok({ config });
  } catch (error) {
    return fail("No autorizado", 403, String(error));
  }
}

export async function PATCH(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const admin = await requireAdminFromRequest(request);
    const payload = patchSchema.parse(await request.json());
    const previous = await prisma.appConfig.findUnique({ where: { id: 1 } });

    const config = await prisma.appConfig.update({
      where: { id: 1 },
      data: payload
    });

    await writeAuditEvent({
      type: "settings_changed",
      actorEmployeeId: admin.id,
      payload: {
        section: "thresholds",
        previous: previous
          ? {
              downtimeThresholdMinutes: previous.downtimeThresholdMinutes,
              voidSpikePercentThreshold: previous.voidSpikePercentThreshold,
              voidSpikeAmountCents: previous.voidSpikeAmountCents,
              cashVarianceApprovalThresholdCents: previous.cashVarianceApprovalThresholdCents,
              cashDrawerCapCents: previous.cashDrawerCapCents,
              cashDrawerSoftWarningPct: previous.cashDrawerSoftWarningPct,
              cashDropResidualCents: previous.cashDropResidualCents
            }
          : null,
        next: payload
      }
    });

    return ok({ config });
  } catch (error) {
    return fail("No fue posible actualizar thresholds", 403, String(error));
  }
}
