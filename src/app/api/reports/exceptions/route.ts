import { fail, ok } from "@/lib/http";
import { parseReportPeriod } from "@/server/api/dateRange";
import { requireAdminFromRequest } from "@/server/services/authService";
import { getOwnerBriefReport } from "@/server/services/reportService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const { period, from, to } = parseReportPeriod(url.searchParams);
    const brief = await getOwnerBriefReport({ period, range: { from, to } });
    return ok({
      period: brief.period,
      comparison: brief.comparison,
      exceptions: brief.exceptions
    });
  } catch (error) {
    return fail("No fue posible cargar excepciones", 403, String(error));
  }
}
