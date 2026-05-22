import { fail, ok } from "@/lib/http";
import { requireEmployeeFromRequest } from "@/server/services/authService";
import { retryFailedPrintJobs } from "@/server/services/printerService";
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

export async function POST(request: Request) {
  await ensureSystemBootstrapped();

  try {
    await requireEmployeeFromRequest(request);

    const url = new URL(request.url);
    const { from, to } = parseWindow(url.searchParams);
    const workOrderNumber = parseWorkOrderNumber(url.searchParams);

    const result = await retryFailedPrintJobs({
      from,
      to,
      workOrderNumber
    });

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      message.includes("PIN de sesion") || message.includes("PIN invalido") || message.includes("PIN duplicado") ? 403 : 400;

    if (statusCode === 403) {
      return fail("No fue posible reimprimir tickets fallidos", statusCode, message);
    }
    return fail("No fue posible reimprimir tickets fallidos", statusCode);
  }
}
