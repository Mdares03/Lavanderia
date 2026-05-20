import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { relayManager } from "@/server/relay/relayManager";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);

    const machines = await prisma.machine.findMany({
      where: { isActive: true },
      select: { id: true, name: true, relayChannel: true },
      orderBy: { relayChannel: "asc" }
    });

    const results: Array<{ machineId: string; machineName: string; relayChannel: number; success: boolean; error?: string }> = [];

    for (const machine of machines) {
      try {
        await relayManager.turnOn(machine.relayChannel);
        await sleep(3_000);
        await relayManager.turnOff(machine.relayChannel);
        results.push({
          machineId: machine.id,
          machineName: machine.name,
          relayChannel: machine.relayChannel,
          success: true
        });
      } catch (error) {
        results.push({
          machineId: machine.id,
          machineName: machine.name,
          relayChannel: machine.relayChannel,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return ok({ count: results.length, results });
  } catch (error) {
    return fail("No fue posible probar relays", 400, String(error));
  }
}
