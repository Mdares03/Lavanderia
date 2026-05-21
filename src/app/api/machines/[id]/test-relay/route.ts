import { fail, ok } from "@/lib/http";
import { RelayApiError } from "@/lib/relay/types";
import { requireAdminFromRequest } from "@/server/services/authService";
import { testMachineRelayAndOptionallyActivate } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const { id } = await context.params;
    const result = await testMachineRelayAndOptionallyActivate(id, true);
    return ok(result);
  } catch (error) {
    if (error instanceof RelayApiError) {
      return fail("No fue posible probar relay", error.status, {
        code: error.code,
        detail: error.detail
      });
    }
    return fail("No fue posible probar relay", 400, String(error));
  }
}
