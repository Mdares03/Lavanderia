import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { relayManager } from "@/server/relay/relayManager";
import { writeAuditEvent } from "@/server/services/auditLog";

type DownSignal = {
  reasonCode: string;
  source: "planned" | "relay_monitor";
};

class AvailabilityMonitor {
  private started = false;
  private timer: NodeJS.Timeout | null = null;
  private downSinceByMachine = new Map<string, Date>();
  private runningSample = false;

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;

    await this.sample().catch((error) => {
      logger.warn("Fallo primer muestreo de disponibilidad", { error: String(error) });
    });

    this.timer = setInterval(() => {
      this.sample().catch((error) => {
        logger.warn("Fallo muestreo de disponibilidad", { error: String(error) });
      });
    }, 60_000);
  }

  private async sample() {
    if (this.runningSample) {
      return;
    }
    this.runningSample = true;

    try {
      const [config, machines, openIncidents] = await Promise.all([
        prisma.appConfig.findUnique({ where: { id: 1 }, select: { downtimeThresholdMinutes: true } }),
        prisma.machine.findMany({
          where: { isActive: true },
          select: { id: true, relayChannel: true, outOfService: true }
        }),
        prisma.availabilityIncident.findMany({
          where: { endedAt: null },
          select: { id: true, machineId: true, startedAt: true, reasonCode: true, source: true }
        })
      ]);

      const thresholdMinutes = Math.max(1, config?.downtimeThresholdMinutes ?? 5);
      const now = new Date();

      const openIncidentByMachine = new Map(openIncidents.map((incident) => [incident.machineId, incident]));
      for (const incident of openIncidents) {
        if (!this.downSinceByMachine.has(incident.machineId)) {
          this.downSinceByMachine.set(incident.machineId, incident.startedAt);
        }
      }

      let relayStatuses: Awaited<ReturnType<typeof relayManager.getAllRelayStatuses>> = [];
      let relayStatusError: string | null = null;
      try {
        relayStatuses = await relayManager.getAllRelayStatuses();
      } catch (error) {
        relayStatusError = error instanceof Error ? error.message : String(error);
      }
      const relayStatusByChannel = new Map(relayStatuses.map((row) => [row.channel, row]));

      for (const machine of machines) {
        const downSignal = this.getDownSignal(machine, relayStatusByChannel, relayStatusError);
        const openIncident = openIncidentByMachine.get(machine.id);

        if (!downSignal) {
          this.downSinceByMachine.delete(machine.id);
          if (openIncident) {
            const minutes = Math.max(1, Math.round((now.getTime() - openIncident.startedAt.getTime()) / 60_000));
            await prisma.availabilityIncident.update({
              where: { id: openIncident.id },
              data: {
                endedAt: now,
                minutes
              }
            });
            await writeAuditEvent({
              type: "availability_incident_closed",
              payload: {
                incidentId: openIncident.id,
                machineId: machine.id,
                minutes
              }
            });
          }
          continue;
        }

        const startedAt = this.downSinceByMachine.get(machine.id) ?? now;
        this.downSinceByMachine.set(machine.id, startedAt);

        if (openIncident) {
          continue;
        }

        const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 60_000;
        if (elapsedMinutes < thresholdMinutes) {
          continue;
        }

        const incident = await prisma.availabilityIncident.create({
          data: {
            machineId: machine.id,
            relayChannel: machine.relayChannel,
            startedAt,
            reasonCode: downSignal.reasonCode,
            source: downSignal.source
          }
        });

        await writeAuditEvent({
          type: "availability_incident_opened",
          payload: {
            incidentId: incident.id,
            machineId: machine.id,
            relayChannel: machine.relayChannel,
            reasonCode: downSignal.reasonCode,
            source: downSignal.source,
            thresholdMinutes
          }
        });
      }
    } finally {
      this.runningSample = false;
    }
  }

  private getDownSignal(
    machine: { relayChannel: number | null; outOfService: boolean },
    relayStatusByChannel: Map<number, { channel: number; enabled: boolean; backend: string; error?: string | undefined }>,
    relayStatusError: string | null
  ): DownSignal | null {
    if (machine.outOfService) {
      return { reasonCode: "out_of_service", source: "planned" };
    }

    if (relayStatusError) {
      return { reasonCode: "relay_api_unavailable", source: "relay_monitor" };
    }

    if (machine.relayChannel === null) {
      return { reasonCode: "channel_unassigned", source: "relay_monitor" };
    }

    const status = relayStatusByChannel.get(machine.relayChannel);
    if (!status) {
      return { reasonCode: "channel_unmapped", source: "relay_monitor" };
    }
    if (!status.enabled || status.backend === "pending") {
      return { reasonCode: "channel_not_wired", source: "relay_monitor" };
    }
    if (status.error) {
      return { reasonCode: status.error, source: "relay_monitor" };
    }

    return null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var availabilityMonitorGlobal: AvailabilityMonitor | undefined;
}

export const availabilityMonitor = global.availabilityMonitorGlobal ?? new AvailabilityMonitor();

if (process.env.NODE_ENV !== "production") {
  global.availabilityMonitorGlobal = availabilityMonitor;
}
