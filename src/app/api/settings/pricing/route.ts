import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const pricingSchema = z.object({
  washerNormalCycleMinutes: z.number().int().positive(),
  washerXlCycleMinutes: z.number().int().positive(),
  dryerNormalCycleMinutes: z.number().int().positive(),
  dryerXlCycleMinutes: z.number().int().positive(),
  selfServiceWashPriceCents: z.number().int().positive(),
  selfServiceDryPriceCents: z.number().int().positive(),
  selfServiceCycleMinutes: z.number().int().positive(),
  encargoPricePerKgCents: z.number().int().positive(),
  encargoMinimumChargeCents: z.number().int().positive(),
  xlEdredonIndividualCents: z.number().int().positive(),
  xlEdredonMatrimonialCents: z.number().int().positive(),
  xlEdredonKingCents: z.number().int().positive(),
  xlCobijaGruesaCents: z.number().int().positive(),
  xlAlmohadaParCents: z.number().int().positive(),
  dryCleaningMinimumCents: z.number().int().positive(),
  dryCleaningUrgentSurchargePct: z.number().int().min(0).max(300),
  detergentAddonCents: z.number().int().min(0).max(10_000),
  softenerAddonCents: z.number().int().min(0).max(10_000),
  bleachAddonCents: z.number().int().min(0).max(10_000),
  loyaltyEveryNTransactions: z.number().int().min(1).max(200),
  loyaltyDiscountPct: z.number().int().min(0).max(100)
});

export async function GET() {
  await ensureSystemBootstrapped();
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      return fail("Configuracion no disponible", 404);
    }

    return ok({
      pricing: {
        washerNormalCycleMinutes: config.washerNormalCycleMinutes,
        washerXlCycleMinutes: config.washerXlCycleMinutes,
        dryerNormalCycleMinutes: config.dryerNormalCycleMinutes,
        dryerXlCycleMinutes: config.dryerXlCycleMinutes,
        selfServiceWashPriceCents: config.selfServiceWashPriceCents,
        selfServiceDryPriceCents: config.selfServiceDryPriceCents,
        selfServiceCycleMinutes: config.selfServiceCycleMinutes,
        encargoPricePerKgCents: config.encargoPricePerKgCents,
        encargoMinimumChargeCents: config.encargoMinimumChargeCents,
        xlEdredonIndividualCents: config.xlEdredonIndividualCents,
        xlEdredonMatrimonialCents: config.xlEdredonMatrimonialCents,
        xlEdredonKingCents: config.xlEdredonKingCents,
        xlCobijaGruesaCents: config.xlCobijaGruesaCents,
        xlAlmohadaParCents: config.xlAlmohadaParCents,
        dryCleaningMinimumCents: config.dryCleaningMinimumCents,
        dryCleaningUrgentSurchargePct: config.dryCleaningUrgentSurchargePct,
        detergentAddonCents: config.detergentAddonCents,
        softenerAddonCents: config.softenerAddonCents,
        bleachAddonCents: config.bleachAddonCents,
        loyaltyEveryNTransactions: config.loyaltyEveryNTransactions,
        loyaltyDiscountPct: config.loyaltyDiscountPct
      }
    });
  } catch (error) {
    return fail("No fue posible cargar precios", 400, String(error));
  }
}

export async function PATCH(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const payload = pricingSchema.parse(await request.json());
    const config = await prisma.appConfig.update({
      where: { id: 1 },
      data: payload
    });
    return ok({
      pricing: payload,
      updatedAt: config.updatedAt
    });
  } catch (error) {
    return fail("No fue posible actualizar precios", 403, String(error));
  }
}
