import { fail, ok } from "@/lib/http";
import { releaseMachine } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    const { id } = await context.params;
    const machine = await releaseMachine(id);
    return ok({ machine });
  } catch (error) {
    return fail("No fue posible liberar maquina", 400, String(error));
  }
}
