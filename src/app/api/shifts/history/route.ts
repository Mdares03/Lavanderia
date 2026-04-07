import { fail, ok } from "@/lib/http";
import { parseDateRange } from "@/server/api/dateRange";
import { requireAdminFromRequest } from "@/server/services/authService";
import { getShiftHistory } from "@/server/services/shiftService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const range = parseDateRange(url.searchParams);
    const shifts = await getShiftHistory(range);
    return ok({ shifts });
  } catch (error) {
    return fail("No fue posible obtener historial de turnos", 403, String(error));
  }
}
