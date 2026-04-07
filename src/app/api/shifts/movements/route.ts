import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { addCashMovement } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  shiftId: z.string(),
  employeeId: z.string(),
  type: z.enum(["deposit", "withdrawal"]),
  amountCents: z.number().int().positive(),
  reason: z.string().min(3).max(120)
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const movement = await addCashMovement(payload);
    return ok({ movement }, 201);
  } catch (error) {
    return fail("No fue posible registrar movimiento", 400, String(error));
  }
}
