import "server-only";

import { prisma } from "@/lib/db";
import { clampRange, minutesBetween } from "@/lib/time";
import { TRANSACTION_STATUS, type ServiceTypeValue } from "@/server/domain/constants";
import { calculateUtilizationPct } from "@/server/services/calculations";
import { getExpectedSafeBalanceCents } from "@/server/services/cashDropService";

export type ReportRange = {
  from: Date;
  to: Date;
};

type SupportedPeriod = "today" | "yesterday" | "last_7" | "this_month" | "custom";

function startOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function expectedDays(from: Date, to: Date) {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function baselineRangeFor(period: SupportedPeriod, range: ReportRange): ReportRange {
  const windowMs = range.to.getTime() - range.from.getTime();
  if (period === "today" || period === "yesterday") {
    const from = new Date(range.from);
    from.setDate(from.getDate() - 7);
    const to = new Date(from.getTime() + windowMs);
    return { from, to };
  }

  if (period === "last_7") {
    const to = new Date(range.from.getTime() - 1);
    const from = new Date(to.getTime() - windowMs);
    return { from, to };
  }

  if (period === "this_month") {
    const currentStart = startOfDay(new Date(range.from.getFullYear(), range.from.getMonth(), 1));
    const previousStart = startOfDay(new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1));
    const elapsedDays = expectedDays(currentStart, range.to);
    const from = previousStart;
    const to = endOfDay(new Date(previousStart.getFullYear(), previousStart.getMonth(), Math.min(elapsedDays, 28)));
    return { from, to };
  }

  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - windowMs);
  return { from, to };
}

async function loadTransactions(range: ReportRange) {
  return prisma.transaction.findMany({
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
}

async function getCoverage(range: ReportRange) {
  const rows = await prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lte: range.to
      },
      status: {
        not: TRANSACTION_STATUS.voided
      }
    },
    select: {
      createdAt: true
    }
  });

  const uniqueDays = new Set(rows.map((row) => dayKey(row.createdAt)));
  const expected = expectedDays(range.from, range.to);
  return {
    expectedDays: expected,
    daysWithData: uniqueDays.size,
    ratio: expected > 0 ? uniqueDays.size / expected : 0
  };
}

function serviceBuckets() {
  return {
    autoservicio: { serviceType: "autoservicio" as ServiceTypeValue, revenueCents: 0, transactions: 0, avgTicketCents: null as number | null },
    encargo: { serviceType: "encargo" as ServiceTypeValue, revenueCents: 0, transactions: 0, avgTicketCents: null as number | null },
    xl: { serviceType: "xl" as ServiceTypeValue, revenueCents: 0, transactions: 0, avgTicketCents: null as number | null }
  };
}

async function summarizeRange(range: ReportRange) {
  const transactions = await loadTransactions(range);
  const byService = serviceBuckets();
  const paymentMap = new Map<string, { paymentMethod: string; amountCents: number; count: number }>();
  const machineCycles = new Map<string, { machineId: string; machineName: string; cycles: number }>();
  const demandByHour = new Map<number, number>();
  const salesByHour = new Map<number, number>();
  const dailySales = new Map<string, number>();
  const serviceMixByDay = new Map<string, { date: string; autoservicio: number; encargo: number; xl: number }>();
  const paymentMixByDay = new Map<string, { date: string; cash: number; card: number; transfer: number }>();

  let totalRevenueCents = 0;

  for (const tx of transactions) {
    totalRevenueCents += tx.amountCents;

    const service = byService[tx.serviceType as ServiceTypeValue];
    if (service) {
      service.revenueCents += tx.amountCents;
      service.transactions += 1;
    }

    const payment = paymentMap.get(tx.paymentMethod) ?? { paymentMethod: tx.paymentMethod, amountCents: 0, count: 0 };
    payment.amountCents += tx.amountCents;
    payment.count += 1;
    paymentMap.set(tx.paymentMethod, payment);

    const machine = machineCycles.get(tx.machineId) ?? { machineId: tx.machineId, machineName: tx.machine.name, cycles: 0 };
    machine.cycles += 1;
    machineCycles.set(tx.machineId, machine);

    const hour = tx.createdAt.getHours();
    demandByHour.set(hour, (demandByHour.get(hour) ?? 0) + 1);
    salesByHour.set(hour, (salesByHour.get(hour) ?? 0) + tx.amountCents);

    const date = tx.createdAt.toISOString().slice(0, 10);
    dailySales.set(date, (dailySales.get(date) ?? 0) + tx.amountCents);

    const dayService = serviceMixByDay.get(date) ?? { date, autoservicio: 0, encargo: 0, xl: 0 };
    if (tx.serviceType === "encargo") {
      dayService.encargo += tx.amountCents;
    } else if (tx.serviceType === "xl") {
      dayService.xl += tx.amountCents;
    } else {
      dayService.autoservicio += tx.amountCents;
    }
    serviceMixByDay.set(date, dayService);

    const dayPayment = paymentMixByDay.get(date) ?? { date, cash: 0, card: 0, transfer: 0 };
    if (tx.paymentMethod === "card") {
      dayPayment.card += tx.amountCents;
    } else if (tx.paymentMethod === "transfer") {
      dayPayment.transfer += tx.amountCents;
    } else {
      dayPayment.cash += tx.amountCents;
    }
    paymentMixByDay.set(date, dayPayment);
  }

  const transactionCount = transactions.length;
  const avgTicketCents = transactionCount > 0 ? Math.round(totalRevenueCents / transactionCount) : null;

  for (const key of Object.keys(byService) as Array<keyof typeof byService>) {
    const row = byService[key];
    row.avgTicketCents = row.transactions > 0 ? Math.round(row.revenueCents / row.transactions) : null;
  }

  const peakHourEntry = Array.from(demandByHour.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;

  return {
    totalRevenueCents,
    transactionCount,
    avgTicketCents,
    byService: Object.values(byService),
    byPaymentMethod: Array.from(paymentMap.values()).sort((a, b) => b.amountCents - a.amountCents),
    cyclesByMachine: Array.from(machineCycles.values()).sort((a, b) => b.cycles - a.cycles),
    demandByHour: Array.from(demandByHour.entries())
      .map(([hour, cycles]) => ({ hour, cycles }))
      .sort((a, b) => a.hour - b.hour),
    salesByHour: Array.from(salesByHour.entries())
      .map(([hour, amountCents]) => ({ hour, amountCents }))
      .sort((a, b) => a.hour - b.hour),
    dailySales: Array.from(dailySales.entries())
      .map(([date, amountCents]) => ({ date, amountCents }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    serviceMixByDay: Array.from(serviceMixByDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    paymentMixByDay: Array.from(paymentMixByDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    peakHourLoad: peakHourEntry ? { hour: peakHourEntry[0], cycles: peakHourEntry[1] } : null,
    transactions
  };
}

function calculateDeltaPct(current: number, baseline: number) {
  if (baseline <= 0) {
    return null;
  }
  return Number((((current - baseline) / baseline) * 100).toFixed(2));
}

export async function getKpiReport(input: { period: SupportedPeriod; range: ReportRange }) {
  const baselineRange = baselineRangeFor(input.period, input.range);
  const [current, baseline, currentCoverage, baselineCoverage] = await Promise.all([
    summarizeRange(input.range),
    summarizeRange(baselineRange),
    getCoverage(input.range),
    getCoverage(baselineRange)
  ]);

  const hasBaselineData = baseline.transactionCount > 0;
  const limitedHistory = baselineCoverage.ratio < 0.7;

  return {
    period: {
      key: input.period,
      from: input.range.from.toISOString(),
      to: input.range.to.toISOString(),
      baselineFrom: baselineRange.from.toISOString(),
      baselineTo: baselineRange.to.toISOString()
    },
    kpis: {
      totalRevenueCents: current.totalRevenueCents,
      transactionCount: current.transactionCount,
      avgTicketCents: current.avgTicketCents,
      avgTicketByService: current.byService,
      paymentMix: current.byPaymentMethod,
      serviceMix: current.byService,
      cyclesByMachine: current.cyclesByMachine,
      peakHourLoad: current.peakHourLoad,
      demandByHour: current.demandByHour,
      salesByHour: current.salesByHour,
      dailySales: current.dailySales,
      serviceMixByDay: current.serviceMixByDay,
      paymentMixByDay: current.paymentMixByDay
    },
    comparison: {
      hasBaselineData,
      limitedHistory,
      baselineCoverage,
      currentCoverage,
      deltaRevenuePct: hasBaselineData && !limitedHistory ? calculateDeltaPct(current.totalRevenueCents, baseline.totalRevenueCents) : null,
      deltaTransactionsPct: hasBaselineData && !limitedHistory ? calculateDeltaPct(current.transactionCount, baseline.transactionCount) : null,
      deltaAvgTicketPct:
        hasBaselineData && !limitedHistory && current.avgTicketCents !== null && baseline.avgTicketCents !== null
          ? calculateDeltaPct(current.avgTicketCents, baseline.avgTicketCents)
          : null,
      message: !hasBaselineData
        ? "no baseline yet"
        : limitedHistory
          ? "limited history"
          : null
    }
  };
}

export async function getOwnerBriefReport(input: { period: SupportedPeriod; range: ReportRange }) {
  const [kpis, voided, relayFailures, activeShift, safeBalanceCents, cashDrops, encargoOrders, incidents] = await Promise.all([
    getKpiReport(input),
    prisma.transaction.aggregate({
      _count: { _all: true },
      _sum: { amountCents: true },
      where: {
        status: TRANSACTION_STATUS.voided,
        voidedAt: {
          gte: input.range.from,
          lte: input.range.to
        }
      }
    }),
    prisma.transaction.count({
      where: {
        status: TRANSACTION_STATUS.relayFailed,
        createdAt: {
          gte: input.range.from,
          lte: input.range.to
        }
      }
    }),
    prisma.shift.findFirst({
      where: { status: "open", endTime: null },
      orderBy: { startTime: "desc" },
      include: {
        cashDrops: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    }),
    getExpectedSafeBalanceCents(),
    prisma.cashDrop.findMany({
      where: {
        createdAt: {
          gte: input.range.from,
          lte: input.range.to
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.encargoOrder.findMany({
      where: {
        status: {
          in: ["order", "processing", "ready"]
        }
      },
      select: {
        id: true,
        status: true,
        receivedAt: true,
        readyAt: true
      }
    }),
    prisma.availabilityIncident.findMany({
      where: {
        startedAt: {
          lte: input.range.to
        },
        OR: [
          { endedAt: null },
          {
            endedAt: {
              gte: input.range.from
            }
          }
        ]
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        machineId: true,
        relayChannel: true,
        startedAt: true,
        endedAt: true,
        minutes: true,
        reasonCode: true,
        source: true
      }
    })
  ]);

  const now = Date.now();
  const oldestWipMinutes = encargoOrders
    .filter((order) => order.status !== "ready")
    .map((order) => Math.max(0, Math.floor((now - order.receivedAt.getTime()) / 60_000)))
    .sort((a, b) => b - a)[0] ?? null;

  const readyNotCollectedCount = encargoOrders.filter((order) => order.status === "ready").length;
  const plannedIncidents = incidents.filter((item) => item.reasonCode === "out_of_service");
  const unplannedIncidents = incidents.filter((item) => item.reasonCode !== "out_of_service");
  const totalIncidentMinutes = incidents.reduce((sum, item) => {
    if (item.minutes && item.minutes > 0) {
      return sum + item.minutes;
    }
    const end = item.endedAt ?? input.range.to;
    const overlappedStart = item.startedAt > input.range.from ? item.startedAt : input.range.from;
    const overlappedEnd = end < input.range.to ? end : input.range.to;
    const delta = Math.max(0, Math.round((overlappedEnd.getTime() - overlappedStart.getTime()) / 60_000));
    return sum + delta;
  }, 0);

  return {
    period: kpis.period,
    comparison: kpis.comparison,
    revenueSnapshot: {
      totalRevenueCents: kpis.kpis.totalRevenueCents,
      transactionCount: kpis.kpis.transactionCount,
      byService: kpis.kpis.serviceMix
    },
    paymentMix: kpis.kpis.paymentMix,
    cashControl: {
      safeExpectedBalanceCents: safeBalanceCents,
      cashDropsCount: cashDrops.length,
      cashDroppedCents: cashDrops.reduce((sum, row) => sum + row.amountCents, 0),
      activeShiftId: activeShift?.id ?? null,
      lastDropAt: activeShift?.cashDrops[0]?.createdAt.toISOString() ?? null,
      lastDropAmountCents: activeShift?.cashDrops[0]?.amountCents ?? null
    },
    exceptions: {
      voidedCount: voided._count._all,
      voidedTotalCents: voided._sum.amountCents ?? 0,
      relayFailureCount: relayFailures,
      availabilityIncidentsCount: incidents.length,
      plannedIncidentsCount: plannedIncidents.length,
      unplannedIncidentsCount: unplannedIncidents.length,
      totalDowntimeMinutes: totalIncidentMinutes
    },
    operations: {
      cyclesByMachine: kpis.kpis.cyclesByMachine,
      peakHourLoad: kpis.kpis.peakHourLoad,
      demandByHour: kpis.kpis.demandByHour
    },
    encargoSummary: {
      wipCount: encargoOrders.filter((order) => order.status !== "ready").length,
      readyNotCollectedCount,
      oldestWipMinutes
    },
    backupStatus: {
      status: "not_configured",
      message: "Pendiente de configurar backup automatico diario"
    },
    availabilityTimeline: incidents.map((item) => ({
      incidentId: item.id,
      machineId: item.machineId,
      relayChannel: item.relayChannel,
      reasonCode: item.reasonCode,
      source: item.source,
      startedAt: item.startedAt.toISOString(),
      endedAt: item.endedAt?.toISOString() ?? null,
      minutes: item.minutes ?? null
    }))
  };
}

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

  const voided = await prisma.transaction.aggregate({
    _count: { _all: true },
    _sum: { amountCents: true },
    where: {
      status: TRANSACTION_STATUS.voided,
      voidedAt: {
        gte: range.from,
        lte: range.to
      }
    }
  });

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
      avgTicketCents,
      voidedCount: voided._count._all,
      voidedTotalCents: voided._sum.amountCents ?? 0
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
    `totales,avgTicketCents,${summary.totals.avgTicketCents},`,
    `totales,voidedCount,${summary.totals.voidedCount},`,
    `totales,voidedTotalCents,${summary.totals.voidedTotalCents},`
  ];

  for (const row of summary.byPaymentMethod) {
    lines.push(`payment,${row.paymentMethod},${row.amountCents},${row.count}`);
  }
  for (const row of summary.byMachine) {
    lines.push(`machine,${row.machineName},${row.amountCents},${row.count}`);
  }

  return lines.join("\n");
}
