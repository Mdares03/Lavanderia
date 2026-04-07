import { fail, ok } from "@/lib/http";
import { getActiveShift, getShiftSummary } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET() {
  await ensureSystemBootstrapped();
  try {
    const shift = await getActiveShift();
    if (!shift) {
      return ok({ shift: null, summary: null });
    }
    const summary = await getShiftSummary(shift.id);
    return ok({ shift, summary });
  } catch (error) {
    return fail("No fue posible cargar turno activo", 400, String(error));
  }
}
