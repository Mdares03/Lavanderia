import { fail, ok } from "@/lib/http";
import { requireEmployeeFromRequest } from "@/server/services/authService";
import { listPrintJobs } from "@/server/services/printerService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

function parseDate(value: string, field: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} invalido`);
  }
  return parsed;
}

function parseWindow(params: URLSearchParams) {
  const now = new Date();
  const toRaw = params.get("to")?.trim() ?? "";
  const fromRaw = params.get("from")?.trim() ?? "";

  const to = toRaw ? parseDate(toRaw, "to") : now;
  const from = fromRaw
    ? parseDate(fromRaw, "from")
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (from > to) {
    throw new Error("Rango de fechas invalido");
  }

  return { from, to };
}

function parseStatus(params: URLSearchParams) {
  const raw = (params.get("status") ?? "all").trim().toLowerCase();
  if (raw === "all" || raw === "pending" || raw === "printed" || raw === "failed") {
    return raw;
  }
  throw new Error("status invalido");
}

function parseWorkOrderNumber(params: URLSearchParams) {
  const raw = params.get("workOrderNumber")?.trim() ?? "";
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("workOrderNumber invalido");
  }
  return parsed;
}

function parseLimit(params: URLSearchParams) {
  const raw = params.get("limit")?.trim() ?? "";
  if (!raw) {
    return 50;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("limit invalido");
  }
  return Math.min(200, parsed);
}

function parseCursor(params: URLSearchParams) {
  const raw = params.get("cursor")?.trim() ?? "";
  return raw.length > 0 ? raw : undefined;
}

export async function GET(request: Request) {
  await ensureSystemBootstrapped();

  try {
    await requireEmployeeFromRequest(request);

    const url = new URL(request.url);
    const { from, to } = parseWindow(url.searchParams);
    const status = parseStatus(url.searchParams);
    const workOrderNumber = parseWorkOrderNumber(url.searchParams);
    const limit = parseLimit(url.searchParams);
    const cursor = parseCursor(url.searchParams);

    const result = await listPrintJobs({
      from,
      to,
      status,
      workOrderNumber,
      limit,
      cursor
    });

    return ok({
      items: result.items,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      message.includes("PIN de sesion") || message.includes("PIN invalido") || message.includes("PIN duplicado") ? 403 : 400;

    return fail("No fue posible consultar historial de impresiones", statusCode, message);
  }
}
