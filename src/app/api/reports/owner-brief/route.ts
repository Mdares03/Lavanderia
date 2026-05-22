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
    const payload = await getOwnerBriefReport({ period, range: { from, to } });
    return ok(payload);
  } catch (error) {
    return fail("No fue posible generar owner brief", 403, String(error));
  }
}
