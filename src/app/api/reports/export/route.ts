import { parseDateRange } from "@/server/api/dateRange";
import { fail } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { getReportCsv } from "@/server/services/reportService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const range = parseDateRange(url.searchParams);
    const csv = await getReportCsv(range);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"reporte.csv\""
      }
    });
  } catch (error) {
    return fail("No fue posible exportar reporte", 403, String(error));
  }
}
