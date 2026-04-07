import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { relayManager } from "@/server/relay/relayManager";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  relayMockMode: z.boolean(),
  serialPortPath: z.string().min(1),
  serialBaudRate: z.number().int().positive()
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const health = await relayManager.getHealth();
    const ports = await relayManager.listSerialPorts();
    return ok({ config, health, ports });
  } catch (error) {
    return fail("No autorizado", 403, String(error));
  }
}

export async function PATCH(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const payload = patchSchema.parse(await request.json());
    await prisma.appConfig.update({
      where: { id: 1 },
      data: payload
    });
    await relayManager.connectWithSettings(payload.relayMockMode, payload.serialPortPath, payload.serialBaudRate);
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const health = await relayManager.getHealth();
    return ok({ config, health });
  } catch (error) {
    return fail("No fue posible actualizar serial", 403, String(error));
  }
}
