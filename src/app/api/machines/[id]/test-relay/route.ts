import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { relayManager } from "@/server/relay/relayManager";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

type Context = {
  params: Promise<{ id: string }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const { id } = await context.params;
    const machine = await prisma.machine.findUnique({
      where: { id },
      select: { id: true, name: true, relayChannel: true }
    });
    if (!machine) {
      throw new Error("Maquina no encontrada");
    }

    await relayManager.turnOn(machine.relayChannel);
    await sleep(2_000);
    await relayManager.turnOff(machine.relayChannel);

    return ok({ machine, success: true });
  } catch (error) {
    return fail("No fue posible probar relay", 400, String(error));
  }
}
