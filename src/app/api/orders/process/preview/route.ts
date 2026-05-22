import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { SERVICE_TYPES } from "@/server/domain/constants";
import { previewOrderProcess } from "@/server/services/orderService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const previewSchema = z.object({
  weightKg: z.number().positive(),
  serviceType: z.enum([SERVICE_TYPES.autoservicio, SERVICE_TYPES.encargo, SERVICE_TYPES.xl])
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = previewSchema.parse(await request.json());
    const result = await previewOrderProcess(payload);
    return ok(result);
  } catch (error) {
    return fail("No fue posible calcular asignacion", 400, String(error));
  }
}
