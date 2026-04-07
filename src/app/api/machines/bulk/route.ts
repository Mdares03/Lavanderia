import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { updateAllMachineDefaults } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const bulkPatchSchema = z
  .object({
    defaultPriceCents: z.number().int().positive().optional(),
    defaultDurationMinutes: z.number().int().positive().optional()
  })
  .refine((value) => value.defaultPriceCents !== undefined || value.defaultDurationMinutes !== undefined, {
    message: "Debe enviar al menos un campo para actualizar"
  });

export async function PATCH(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const payload = bulkPatchSchema.parse(await request.json());
    const result = await updateAllMachineDefaults(payload);
    return ok({ updated: result.count });
  } catch (error) {
    return fail("No fue posible actualizar maquinas", 403, String(error));
  }
}
