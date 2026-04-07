import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { closeShift } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  shiftId: z.string(),
  actualCashCents: z.number().int().min(0),
  notes: z.string().max(300).optional()
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const shift = await closeShift(payload);
    return ok({ shift });
  } catch (error) {
    return fail("No fue posible cerrar turno", 400, String(error));
  }
}
