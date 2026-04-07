import { z } from "zod";

import { addTimeToTransaction } from "@/server/services/activationService";
import { fail, ok } from "@/lib/http";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  employeeId: z.string(),
  extraMinutes: z.number().int().positive(),
  extraAmountCents: z.number().int().min(0),
  reason: z.string().max(120).optional()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    const { id } = await context.params;
    const payload = schema.parse(await request.json());
    const transaction = await addTimeToTransaction({
      transactionId: id,
      ...payload
    });
    return ok({ transaction });
  } catch (error) {
    return fail("No fue posible agregar tiempo", 400, String(error));
  }
}
