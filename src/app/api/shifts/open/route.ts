import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { openShift } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  employeeId: z.string(),
  startingCashCents: z.number().int().min(0)
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const shift = await openShift(payload);
    return ok({ shift }, 201);
  } catch (error) {
    return fail("No fue posible abrir turno", 400, String(error));
  }
}
