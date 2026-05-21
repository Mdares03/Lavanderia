import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { RelayApiError } from "@/lib/relay/types";
import { relayManager } from "@/server/relay/relayManager";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const updateSchema = z.object({
  channels: z
    .array(
      z
        .object({
          channel: z.number().int().min(1).max(26),
          label: z.string().min(1).max(120).optional(),
          enabled: z.boolean().optional()
        })
        .refine((item) => item.label !== undefined || item.enabled !== undefined, {
          message: "Cada canal debe incluir label o enabled"
        })
    )
    .min(1)
});

function getRelayAdminToken() {
  return process.env.RELAY_ADMIN_TOKEN?.trim() ?? "";
}

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const token = getRelayAdminToken();
    if (!token) {
      return fail("RELAY_ADMIN_TOKEN no configurado", 500);
    }

    const channels = await relayManager.getRelayConfigChannels(token);
    return ok({ channels });
  } catch (error) {
    if (error instanceof RelayApiError) {
      return fail(error.message, error.status, {
        code: error.code,
        detail: error.detail
      });
    }
    return fail("No fue posible consultar configuracion de relays", 400, String(error));
  }
}

export async function PUT(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const token = getRelayAdminToken();
    if (!token) {
      return fail("RELAY_ADMIN_TOKEN no configurado", 500);
    }

    const payload = updateSchema.parse(await request.json());
    const channels = await relayManager.updateRelayConfigChannels(token, payload.channels);
    return ok({ channels });
  } catch (error) {
    if (error instanceof RelayApiError) {
      return fail(error.message, error.status, {
        code: error.code,
        detail: error.detail
      });
    }
    return fail("No fue posible actualizar configuracion de relays", 400, String(error));
  }
}
