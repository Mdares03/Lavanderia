import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { ENCARGO_ORDER_STATUS } from "@/server/domain/constants";
import { setEncargoOrderStatus } from "@/server/services/encargoService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  status: z.enum([
    ENCARGO_ORDER_STATUS.recibido,
    ENCARGO_ORDER_STATUS.lavando,
    ENCARGO_ORDER_STATUS.secando,
    ENCARGO_ORDER_STATUS.doblando,
    ENCARGO_ORDER_STATUS.listo,
    ENCARGO_ORDER_STATUS.entregado
  ]),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    const { id } = await context.params;
    const payload = patchSchema.parse(await request.json());
    const order = await setEncargoOrderStatus({
      orderId: id,
      status: payload.status,
      paymentMethod: payload.paymentMethod
    });
    return ok({ order });
  } catch (error) {
    return fail("No fue posible actualizar encargo", 400, String(error));
  }
}
