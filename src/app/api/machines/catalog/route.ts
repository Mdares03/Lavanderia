import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { listAdminMachines } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const machines = await listAdminMachines();
    return ok({ machines });
  } catch (error) {
    return fail("No autorizado", 403, String(error));
  }
}
