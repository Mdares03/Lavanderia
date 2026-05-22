import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { PAYMENT_METHODS, SERVICE_TYPES } from "@/server/domain/constants";
import { processOrder } from "@/server/services/orderService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const processSchema = z.object({
  employeeId: z.string(),
  customerId: z.string(),
  serviceType: z.enum([SERVICE_TYPES.autoservicio, SERVICE_TYPES.encargo, SERVICE_TYPES.xl]),
  paymentMethod: z.enum([PAYMENT_METHODS.cash, PAYMENT_METHODS.card, PAYMENT_METHODS.transfer]),
  baseAmountCents: z.number().int().positive(),
  weightKg: z.number().positive(),
  encargoOrderId: z.string().optional(),
  addons: z.object({
    detergentQty: z.number().int().min(0).max(50),
    softenerQty: z.number().int().min(0).max(50),
    bleachQty: z.number().int().min(0).max(50)
  })
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = processSchema.parse(await request.json());
    const result = await processOrder(payload);
    return ok(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : null;
    const detail = typeof error === "object" && error !== null && "detail" in error ? (error as { detail?: unknown }).detail : undefined;

    if (code === "insufficient_washers") {
      return fail(message, 409, detail);
    }

    return fail("No fue posible procesar orden", 400, message);
  }
}
