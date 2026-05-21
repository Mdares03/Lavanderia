import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { softRemoveMachineAdmin } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const { id } = await context.params;
    const machine = await softRemoveMachineAdmin(id);
    return ok({ machine });
  } catch (error) {
    return fail("No fue posible remover maquina", 403, String(error));
  }
}
