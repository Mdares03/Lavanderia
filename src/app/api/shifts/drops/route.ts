import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { registerCashDrop } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  shiftId: z.string(),
  employeeId: z.string(),
  amountCents: z.number().int().positive().optional(),
  destination: z.enum(["safe", "bank", "owner_pickup"]).optional(),
  reason: z.enum(["threshold", "manual", "shift_close"]).optional(),
  notes: z.string().max(200).optional(),
  overrideUsed: z.boolean().optional(),
  approvedByEmployeeId: z.string().optional()
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const result = await registerCashDrop(payload);
    return ok(result, 201);
  } catch (error) {
    return fail("No fue posible registrar cash drop", 400, String(error));
  }
}
