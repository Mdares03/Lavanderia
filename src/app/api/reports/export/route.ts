import { parseDateRange } from "@/server/api/dateRange";
import { fail } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { buildZipBundle, getAnalyticsExportPack, getReportCsv } from "@/server/services/reportService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const range = parseDateRange(url.searchParams);
    const format = (url.searchParams.get("format") ?? "analytics_pack").trim().toLowerCase();

    if (format === "legacy_summary") {
      const csv = await getReportCsv(range);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"reporte.csv\""
        }
      });
    }

    if (format !== "analytics_pack") {
      return fail("Formato de exportacion invalido", 400, format);
    }

    const pack = await getAnalyticsExportPack(range);
    const zipName = `analytics_export_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.zip`;
    const archive = buildZipBundle(pack.files);
    const archiveBuffer = new ArrayBuffer(archive.byteLength);
    new Uint8Array(archiveBuffer).set(archive);
    return new Response(archiveBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "X-Export-Timezone": pack.timezone
      }
    });
  } catch (error) {
    return fail("No fue posible exportar reporte", 403, String(error));
  }
}
