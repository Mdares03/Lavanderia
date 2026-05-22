import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { getAdminPinFromRequest } from "@/server/services/authService";
import { voidTransaction } from "@/server/services/activationService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  employeeId: z.string(),
  reason: z.string().min(4).max(200),
  reasonCode: z
    .enum(["customer_changed_mind", "cashier_error", "machine_failure", "refund", "service_change", "other"])
    .optional(),
  reasonNotes: z.string().max(200).optional()
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
      reason: payload.reason,
      reasonCode: payload.reasonCode,
      reasonNotes: payload.reasonNotes,
      employeeId: payload.employeeId,
      adminPin: getAdminPinFromRequest(request)
    });
    return ok({ transaction });
  } catch (error) {
    return fail("No fue posible anular transaccion", 400, String(error));
  }
}
