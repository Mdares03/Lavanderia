import { fail, ok } from "@/lib/http";
import { parseDateRange } from "@/server/api/dateRange";
import { requireAdminFromRequest } from "@/server/services/authService";
import { getUtilizationReport } from "@/server/services/reportService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const range = parseDateRange(url.searchParams);
    const utilization = await getUtilizationReport(range);
    return ok({ utilization, range });
  } catch (error) {
    return fail("No fue posible generar utilizacion", 403, String(error));
  }
}
