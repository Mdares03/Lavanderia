import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { closeShift, getShiftSummary } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  shiftId: z.string(),
  employeeId: z.string(),
  actualCashCents: z.number().int().min(0),
  notes: z.string().max(300).optional(),
  varianceApprovedByEmployeeId: z.string().optional(),
  varianceApprovalNote: z.string().max(300).optional()
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const shift = await closeShift(payload);
    const summary = await getShiftSummary(shift.id);
    return ok({ shift, summary });
  } catch (error) {
    return fail("No fue posible cerrar turno", 400, String(error));
  }
}
