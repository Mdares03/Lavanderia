import { fail, ok } from "@/lib/http";
import { parseDateRange } from "@/server/api/dateRange";
import { requireAdminFromRequest } from "@/server/services/authService";
import { getReportSummary } from "@/server/services/reportService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const range = parseDateRange(url.searchParams);
    const summary = await getReportSummary(range);
    return ok(summary);
  } catch (error) {
    return fail("No fue posible generar reporte", 403, String(error));
  }
}
