import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { RelayApiError } from "@/lib/relay/types";
import { relayManager } from "@/server/relay/relayManager";
import { requireAdminFromRequest } from "@/server/services/authService";
import { saveMachineRelayTestResult } from "@/server/services/machineService";
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
      orderBy: [{ relayChannel: "asc" }, { createdAt: "asc" }]
    });

    const results: Array<{
      machineId: string;
      machineName: string;
      relayChannel: number | null;
      success: boolean;
      skipped?: boolean;
      error?: string;
      code?: string;
    }> = [];

    for (const machine of machines) {
      if (machine.relayChannel === null) {
        results.push({
          machineId: machine.id,
          machineName: machine.name,
          relayChannel: null,
          success: false,
          skipped: true,
          code: "channel_unassigned",
          error: "Canal no asignado"
        });
        await saveMachineRelayTestResult({
          machineId: machine.id,
          success: false,
          error: "Canal no asignado"
        });
        continue;
      }

      try {
        await relayManager.assertChannelReady(machine.relayChannel);
        await relayManager.turnOn(machine.relayChannel);
        await sleep(3_000);
        await relayManager.turnOff(machine.relayChannel);
        await saveMachineRelayTestResult({
          machineId: machine.id,
          success: true
        });
        results.push({
          machineId: machine.id,
          machineName: machine.name,
          relayChannel: machine.relayChannel,
          success: true
        });
      } catch (error) {
        if (error instanceof RelayApiError && error.code === "channel_not_wired") {
          await saveMachineRelayTestResult({
            machineId: machine.id,
            success: false,
            error: "Pendiente de hardware"
          });
          results.push({
            machineId: machine.id,
            machineName: machine.name,
            relayChannel: machine.relayChannel,
            success: false,
            skipped: true,
            code: error.code,
            error: "Pendiente de hardware"
          });
          continue;
        }
        await saveMachineRelayTestResult({
          machineId: machine.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        results.push({
          machineId: machine.id,
          machineName: machine.name,
          relayChannel: machine.relayChannel,
          success: false,
          code: error instanceof RelayApiError ? error.code : undefined,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return ok({ count: results.length, results });
  } catch (error) {
    return fail("No fue posible probar relays", 400, String(error));
  }
}
