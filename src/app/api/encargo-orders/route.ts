import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { createEncargoOrder, listEncargoOrders } from "@/server/services/encargoService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const createSchema = z
  .object({
    employeeId: z.string(),
    customerId: z.string(),
    weightKg: z.number().positive(),
    loads: z.number().int().positive(),
    notes: z.string().max(300).optional(),
    paymentMode: z.enum(["now", "pickup"]),
    paymentMethod: z.enum(["cash", "card", "transfer"]).optional()
  })
  .superRefine((value, ctx) => {
    if (value.paymentMode === "now" && !value.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metodo de pago requerido cuando se cobra ahora",
        path: ["paymentMethod"]
      });
    }
  });

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const url = new URL(request.url);
    const includeDelivered = url.searchParams.get("includeDelivered") === "1";
    const orders = await listEncargoOrders({ includeDelivered });
    return ok({ orders });
  } catch (error) {
    return fail("No fue posible obtener encargos", 400, String(error));
  }
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = createSchema.parse(await request.json());
    const order = await createEncargoOrder(payload);
    return ok({ order }, 201);
  } catch (error) {
    return fail("No fue posible crear encargo", 400, String(error));
  }
}
