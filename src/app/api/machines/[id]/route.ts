import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { updateMachineAdmin } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  type: z.enum(["washer", "dryer"]).optional(),
  size: z.enum(["normal", "xl"]).optional(),
  relayChannel: z.union([z.number().int().min(1).max(63), z.null()]).optional(),
  defaultPriceCents: z.number().int().positive().optional(),
  defaultDurationMinutes: z.number().int().positive().optional(),
  outOfService: z.boolean().optional(),
  isActive: z.boolean().optional()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const { id } = await context.params;
    const payload = patchSchema.parse(await request.json());
    const machine = await updateMachineAdmin(id, payload);
    return ok({ machine });
  } catch (error) {
    return fail("No fue posible actualizar maquina", 403, String(error));
  }
}
