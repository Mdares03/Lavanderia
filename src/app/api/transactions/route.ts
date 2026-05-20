import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { SERVICE_TYPES } from "@/server/domain/constants";
import { activateMachine } from "@/server/services/activationService";
import { parseDateRange } from "@/server/api/dateRange";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const activationSchema = z.object({
  machineId: z.string(),
  employeeId: z.string(),
  customerId: z.string(),
  baseAmountCents: z.number().int().positive(),
  durationMinutes: z.number().int().positive(),
  serviceType: z.enum([SERVICE_TYPES.autoservicio, SERVICE_TYPES.encargo, SERVICE_TYPES.xl]),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  encargoOrderId: z.string().optional(),
  addons: z.object({
    detergentQty: z.number().int().min(0).max(50),
    softenerQty: z.number().int().min(0).max(50),
    bleachQty: z.number().int().min(0).max(50)
  })
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const url = new URL(request.url);
    const range = parseDateRange(url.searchParams);
    const status = url.searchParams.get("status");
    const customerId = url.searchParams.get("customerId");
    const limitRaw = url.searchParams.get("limit");
    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    const limit = parsedLimit && Number.isFinite(parsedLimit) ? Math.max(1, Math.min(200, Math.floor(parsedLimit))) : undefined;
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: range.from,
          lte: range.to
        },
        status: status ?? undefined,
        customerId: customerId ?? undefined
      },
      include: {
        machine: {
          select: { name: true }
        },
        employee: {
          select: { name: true }
        },
        customer: {
          select: { firstName: true, lastName: true, phone: true, email: true }
        },
        voidedByEmployee: {
          select: { id: true, name: true }
        },
        parentTransaction: {
          select: { id: true, ticketNumber: true }
        },
        extensions: true
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return ok({ transactions });
  } catch (error) {
    return fail("No fue posible obtener transacciones", 400, String(error));
  }
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = activationSchema.parse(await request.json());
    const result = await activateMachine(payload);
    return ok(result, 201);
  } catch (error) {
    return fail("No fue posible activar maquina", 400, String(error));
  }
}
