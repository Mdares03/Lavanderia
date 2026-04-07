import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { voidTransaction } from "@/server/services/activationService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  reason: z.string().min(4).max(200)
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    const { id } = await context.params;
    const payload = schema.parse(await request.json());
    const transaction = await voidTransaction({
      transactionId: id,
      reason: payload.reason
    });
    return ok({ transaction });
  } catch (error) {
    return fail("No fue posible anular transaccion", 400, String(error));
  }
}
