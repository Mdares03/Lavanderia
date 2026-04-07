import "server-only";

import { prisma } from "@/lib/db";
import { clampRange, minutesBetween } from "@/lib/time";
import { TRANSACTION_STATUS } from "@/server/domain/constants";
import { calculateUtilizationPct } from "@/server/services/calculations";

export type ReportRange = {
  from: Date;
  to: Date;
};

export async function getReportSummary(range: ReportRange) {
  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lte: range.to
      },
      status: {
        not: TRANSACTION_STATUS.voided
      }
    },
    include: {
      machine: {
        select: { id: true, name: true }
      }
    }
  });

  const totalRevenueCents = transactions.reduce((sum, tx) => sum + tx.amountCents, 0);
  const transactionCount = transactions.length;
  const avgTicketCents = transactionCount > 0 ? Math.round(totalRevenueCents / transactionCount) : 0;

  const paymentMap = new Map<string, { amountCents: number; count: number }>();
  const machineMap = new Map<string, { machineId: string; machineName: string; amountCents: number; count: number }>();

  for (const tx of transactions) {
    const paymentEntry = paymentMap.get(tx.paymentMethod) ?? { amountCents: 0, count: 0 };
    paymentEntry.amountCents += tx.amountCents;
    paymentEntry.count += 1;
    paymentMap.set(tx.paymentMethod, paymentEntry);

    const machineEntry = machineMap.get(tx.machineId) ?? {
      machineId: tx.machineId,
      machineName: tx.machine.name,
      amountCents: 0,
      count: 0
    };
    machineEntry.amountCents += tx.amountCents;
    machineEntry.count += 1;
    machineMap.set(tx.machineId, machineEntry);
  }

  return {
    range,
    totals: {
      totalRevenueCents,
      transactionCount,
      avgTicketCents
    },
    byPaymentMethod: Array.from(paymentMap.entries()).map(([paymentMethod, value]) => ({
      paymentMethod,
      ...value
    })),
    byMachine: Array.from(machineMap.values()).sort((a, b) => b.amountCents - a.amountCents)
  };
}

export async function getUtilizationReport(range: ReportRange) {
  const machines = await prisma.machine.findMany({
    where: { isActive: true },
    orderBy: { relayChannel: "asc" }
  });
  const transactions = await prisma.transaction.findMany({
    where: {
      status: {
        in: [TRANSACTION_STATUS.running, TRANSACTION_STATUS.completed]
      },
      startedAt: {
        lte: range.to
      },
      OR: [
        {
          endedAt: {
            gte: range.from
          }
        },
        {
          endedAt: null,
          expectedEndAt: {
            gte: range.from
          }
        }
      ]
    }
  });

  const totalWindowMinutes = minutesBetween(range.from, range.to);
  const usageByMachine = new Map<string, number>();

  for (const tx of transactions) {
    const txEnd = tx.endedAt ?? tx.expectedEndAt;
    const overlap = clampRange(tx.startedAt, txEnd, range.from, range.to);
    if (!overlap) {
      continue;
    }
    const minutes = minutesBetween(overlap.start, overlap.end);
    usageByMachine.set(tx.machineId, (usageByMachine.get(tx.machineId) ?? 0) + minutes);
  }

  return machines.map((machine) => {
    const usedMinutes = usageByMachine.get(machine.id) ?? 0;
    const utilizationPct = calculateUtilizationPct(usedMinutes, totalWindowMinutes);
    return {
      machineId: machine.id,
      machineName: machine.name,
      usedMinutes: Number(usedMinutes.toFixed(2)),
      totalWindowMinutes: Number(totalWindowMinutes.toFixed(2)),
      utilizationPct
    };
  });
}

export async function getReportCsv(range: ReportRange) {
  const summary = await getReportSummary(range);
  const lines = [
    "Tipo,Clave,Valor1,Valor2",
    `totales,totalRevenueCents,${summary.totals.totalRevenueCents},`,
    `totales,transactionCount,${summary.totals.transactionCount},`,
    `totales,avgTicketCents,${summary.totals.avgTicketCents},`
  ];

  for (const row of summary.byPaymentMethod) {
    lines.push(`payment,${row.paymentMethod},${row.amountCents},${row.count}`);
  }
  for (const row of summary.byMachine) {
    lines.push(`machine,${row.machineName},${row.amountCents},${row.count}`);
  }

  return lines.join("\n");
}
