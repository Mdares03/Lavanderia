import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { APP_DEFAULTS } from "@/lib/config";
import { relayManager } from "@/server/relay/relayManager";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const reconnectSchema = z.object({
  serialPortPath: z.string().optional(),
  serialBaudRate: z.number().int().positive().optional()
});

export async function GET() {
  try {
    await ensureSystemBootstrapped();
    const health = await relayManager.getHealth();
    const ports = await relayManager.listSerialPorts();
    const map = await relayManager.getRelayMap();
    const statuses = await relayManager.getAllRelayStatuses();
    return ok({ health, ports, map, statuses });
  } catch (error) {
    return fail("No fue posible consultar relay", 500, String(error));
  }
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const raw = await request.text();
    const payload = reconnectSchema.parse(raw ? JSON.parse(raw) : {});
    if (payload.serialPortPath || payload.serialBaudRate) {
      await relayManager.connectWithSettings(
        false,
        payload.serialPortPath ?? APP_DEFAULTS.serialPortPath,
        payload.serialBaudRate ?? APP_DEFAULTS.serialBaudRate
      );
    } else {
      await relayManager.reconnect();
    }
    const health = await relayManager.getHealth();
    const map = await relayManager.getRelayMap();
    const statuses = await relayManager.getAllRelayStatuses();
    return ok({ health, map, statuses });
  } catch (error) {
    return fail("No fue posible reconectar relay", 400, String(error));
  }
}
