import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/server/services/authService";
import { getDashboardMachines } from "@/server/services/machineService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const createSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["washer", "dryer"]),
  relayChannel: z.number().int().min(0).max(63),
  defaultPriceCents: z.number().int().positive(),
  defaultDurationMinutes: z.number().int().positive()
});

export async function GET() {
  await ensureSystemBootstrapped();
  const data = await getDashboardMachines();
  return ok({ machines: data });
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const payload = createSchema.parse(await request.json());
    const machine = await prisma.machine.create({
      data: payload
    });
    return ok({ machine }, 201);
  } catch (error) {
    return fail("No fue posible crear maquina", 403, String(error));
  }
}
