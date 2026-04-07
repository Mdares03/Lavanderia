import { fail, ok } from "@/lib/http";
import { retryRelayOn } from "@/server/services/activationService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    const { id } = await context.params;
    const transaction = await retryRelayOn(id);
    return ok({ transaction });
  } catch (error) {
    return fail("No fue posible reintentar relay", 400, String(error));
  }
}
