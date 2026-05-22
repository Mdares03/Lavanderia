import { fail, ok } from "@/lib/http";
import { requireEmployeeFromRequest } from "@/server/services/authService";
import { retryPrintJob } from "@/server/services/printerService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSystemBootstrapped();
  try {
    await requireEmployeeFromRequest(request);
    const { id } = await context.params;
    const job = await retryPrintJob(id);
    return ok({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      message.includes("PIN de sesion") || message.includes("PIN invalido") || message.includes("PIN duplicado") ? 403 : 400;
    if (statusCode === 403) {
      return fail("No fue posible reimprimir ticket", statusCode, message);
    }
    return fail("No fue posible reimprimir ticket", statusCode);
  }
}
