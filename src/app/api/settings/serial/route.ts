import { z } from "zod";

import { prisma } from "@/lib/db";
import { APP_DEFAULTS } from "@/lib/config";
import { fail, ok } from "@/lib/http";
import { relayManager } from "@/server/relay/relayManager";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  serialPortPath: z.string().min(1).optional(),
  serialBaudRate: z.number().int().positive().optional()
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const health = await relayManager.getHealth();
    const ports = await relayManager.listSerialPorts();
    const map = await relayManager.getRelayMap();
    const statuses = await relayManager.getAllRelayStatuses();
    return ok({ config, health, ports, map, statuses });
  } catch (error) {
    return fail("No autorizado", 403, String(error));
  }
}

export async function PATCH(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const payload = patchSchema.parse(await request.json());
    const serialPortPath = payload.serialPortPath ?? APP_DEFAULTS.serialPortPath;
    const serialBaudRate = payload.serialBaudRate ?? APP_DEFAULTS.serialBaudRate;
    await prisma.appConfig.update({
      where: { id: 1 },
      data: {
        relayMockMode: false,
        serialPortPath,
        serialBaudRate
      }
    });
    await relayManager.connectWithSettings(false, serialPortPath, serialBaudRate);
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const health = await relayManager.getHealth();
    const map = await relayManager.getRelayMap();
    const statuses = await relayManager.getAllRelayStatuses();
    return ok({ config, health, map, statuses });
  } catch (error) {
    return fail("No fue posible actualizar serial", 403, String(error));
  }
}
