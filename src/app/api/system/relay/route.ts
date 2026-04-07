import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { relayManager } from "@/server/relay/relayManager";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const reconnectSchema = z.object({
  relayMockMode: z.boolean().optional(),
  serialPortPath: z.string().optional(),
  serialBaudRate: z.number().int().positive().optional()
});

export async function GET() {
  try {
    await ensureSystemBootstrapped();
    const health = await relayManager.getHealth();
    const ports = await relayManager.listSerialPorts();
    return ok({ health, ports });
  } catch (error) {
    return fail("No fue posible consultar relay", 500, String(error));
  }
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = reconnectSchema.parse(await request.json());
    if (payload.relayMockMode !== undefined && payload.serialPortPath && payload.serialBaudRate) {
      await relayManager.connectWithSettings(payload.relayMockMode, payload.serialPortPath, payload.serialBaudRate);
    } else {
      await relayManager.reconnect();
    }
    const health = await relayManager.getHealth();
    return ok({ health });
  } catch (error) {
    return fail("No fue posible reconectar relay", 400, String(error));
  }
}
