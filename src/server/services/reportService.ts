import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import { prisma } from "@/lib/db";
import { clampRange, minutesBetween } from "@/lib/time";
import { TRANSACTION_STATUS, type ServiceTypeValue } from "@/server/domain/constants";
import { calculateUtilizationPct } from "@/server/services/calculations";
import { getExpectedSafeBalanceCents } from "@/server/services/cashDropService";

export type ReportRange = {
  from: Date;
  to: Date;
};

export type CsvFile = {
  name: string;
  content: string;
};

export type AnalyticsExportPack = {
  timezone: string;
  files: [CsvFile, CsvFile, CsvFile];
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

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map((header) => escapeCsvCell(header)).join(",")];
  for (const row of rows) {
    lines.push(row.map((value) => escapeCsvCell(value)).join(","));
  }
  return lines.join("\n");
}

function toLocalDate(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

function toLocalHour(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "HH");
}

function toLocalDateTime(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd HH:mm:ssXXX");
}

async function getBusinessTimezone() {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { timezone: true, currency: true } });
  return {
    timezone: config?.timezone?.trim() || "America/Monterrey",
    currency: config?.currency?.trim().toUpperCase() || "MXN"
  };
}

function formatMoneyFromCents(cents: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
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
  const machineIds = Array.from(new Set(incidents.map((item) => item.machineId)));
  const machines = machineIds.length
    ? await prisma.machine.findMany({
        where: { id: { in: machineIds } },
        select: { id: true, lastRelayTestOk: true, hardwareValidatedAt: true }
      })
    : [];
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));

  const incidentsCountedForDowntime = incidents.filter((item) => {
    if (item.reasonCode !== "channel_not_wired") {
      return true;
    }
    const machine = machineById.get(item.machineId);
    return Boolean(machine?.lastRelayTestOk || machine?.hardwareValidatedAt);
  });

  const plannedIncidents = incidentsCountedForDowntime.filter((item) => item.reasonCode === "out_of_service");
  const unplannedIncidents = incidentsCountedForDowntime.filter((item) => item.reasonCode !== "out_of_service");
  const totalIncidentMinutes = incidentsCountedForDowntime.reduce((sum, item) => {
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
      availabilityIncidentsCount: incidentsCountedForDowntime.length,
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
    availabilityTimeline: incidentsCountedForDowntime.map((item) => ({
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

export async function getAnalyticsExportPack(range: ReportRange): Promise<AnalyticsExportPack> {
  const { timezone, currency } = await getBusinessTimezone();

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lte: range.to
      }
    },
    include: {
      machine: {
        select: { id: true, name: true }
      },
      employee: {
        select: { id: true, name: true }
      },
      customer: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true }
      },
      voidedByEmployee: {
        select: { id: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const transactionRows = transactions.map((tx) => {
    const createdDateLocal = toLocalDate(tx.createdAt, timezone);
    const createdHourLocal = Number(toLocalHour(tx.createdAt, timezone));
    return [
      tx.id,
      tx.ticketNumber,
      tx.machineId,
      tx.machine.name,
      tx.employeeId,
      tx.employee.name,
      tx.customerId,
      tx.customer.firstName,
      tx.customer.lastName,
      tx.customer.phone,
      tx.customer.email,
      tx.status,
      tx.serviceType,
      tx.paymentMethod,
      tx.isExtension,
      tx.parentTransactionId,
      tx.encargoOrderId,
      tx.baseAmountCents,
      formatMoneyFromCents(tx.baseAmountCents, currency),
      tx.discountCents,
      formatMoneyFromCents(tx.discountCents, currency),
      tx.addonAmountCents,
      formatMoneyFromCents(tx.addonAmountCents, currency),
      tx.amountCents,
      formatMoneyFromCents(tx.amountCents, currency),
      tx.createdAt.toISOString(),
      toLocalDateTime(tx.createdAt, timezone),
      createdDateLocal,
      createdHourLocal,
      tx.startedAt.toISOString(),
      tx.expectedEndAt.toISOString(),
      tx.endedAt?.toISOString() ?? null,
      tx.voidedAt?.toISOString() ?? null,
      tx.voidReason,
      tx.voidReasonCode,
      tx.voidReasonNotes,
      tx.voidedByEmployee?.id ?? tx.voidedByEmployeeId,
      tx.relayFailureReason
    ];
  });

  const transactionsCsv = buildCsv(
    [
      "transaction_id",
      "ticket_number",
      "machine_id",
      "machine_name",
      "employee_id",
      "employee_name",
      "customer_id",
      "customer_first_name",
      "customer_last_name",
      "customer_phone",
      "customer_email",
      "status",
      "service_type",
      "payment_method",
      "is_extension",
      "parent_transaction_id",
      "encargo_order_id",
      "base_amount_cents",
      "base_amount",
      "discount_cents",
      "discount_amount",
      "addon_amount_cents",
      "addon_amount",
      "amount_cents",
      "amount",
      "created_at_utc",
      "created_at_local",
      "date_local",
      "hour_local",
      "started_at_utc",
      "expected_end_at_utc",
      "ended_at_utc",
      "voided_at_utc",
      "void_reason",
      "void_reason_code",
      "void_reason_notes",
      "voided_by_employee_id",
      "relay_failure_reason"
    ],
    transactionRows
  );

  type BreakdownAgg = {
    grain: "hourly" | "daily";
    bucketStartLocal: string;
    dateLocal: string;
    hourLocal: string;
    status: string;
    serviceType: string;
    paymentMethod: string;
    machineId: string;
    machineName: string;
    transactionCount: number;
    amountCentsSum: number;
    baseAmountCentsSum: number;
    discountCentsSum: number;
    addonAmountCentsSum: number;
  };

  const breakdownMap = new Map<string, BreakdownAgg>();
  const upsertBreakdown = (input: Omit<BreakdownAgg, "transactionCount" | "amountCentsSum" | "baseAmountCentsSum" | "discountCentsSum" | "addonAmountCentsSum">, tx: (typeof transactions)[number]) => {
    const key = [
      input.grain,
      input.bucketStartLocal,
      input.status,
      input.serviceType,
      input.paymentMethod,
      input.machineId
    ].join("|");
    const existing = breakdownMap.get(key) ?? {
      ...input,
      transactionCount: 0,
      amountCentsSum: 0,
      baseAmountCentsSum: 0,
      discountCentsSum: 0,
      addonAmountCentsSum: 0
    };
    existing.transactionCount += 1;
    existing.amountCentsSum += tx.amountCents;
    existing.baseAmountCentsSum += tx.baseAmountCents;
    existing.discountCentsSum += tx.discountCents;
    existing.addonAmountCentsSum += tx.addonAmountCents;
    breakdownMap.set(key, existing);
  };

  for (const tx of transactions) {
    const dateLocal = toLocalDate(tx.createdAt, timezone);
    const hourLocal = toLocalHour(tx.createdAt, timezone);
    upsertBreakdown(
      {
        grain: "hourly",
        bucketStartLocal: `${dateLocal} ${hourLocal}:00:00`,
        dateLocal,
        hourLocal,
        status: tx.status,
        serviceType: tx.serviceType,
        paymentMethod: tx.paymentMethod,
        machineId: tx.machineId,
        machineName: tx.machine.name
      },
      tx
    );
    upsertBreakdown(
      {
        grain: "daily",
        bucketStartLocal: `${dateLocal} 00:00:00`,
        dateLocal,
        hourLocal: "",
        status: tx.status,
        serviceType: tx.serviceType,
        paymentMethod: tx.paymentMethod,
        machineId: tx.machineId,
        machineName: tx.machine.name
      },
      tx
    );
  }

  const breakdownRows = Array.from(breakdownMap.values())
    .sort((a, b) => {
      if (a.grain !== b.grain) {
        return a.grain.localeCompare(b.grain);
      }
      if (a.bucketStartLocal !== b.bucketStartLocal) {
        return a.bucketStartLocal.localeCompare(b.bucketStartLocal);
      }
      return a.machineName.localeCompare(b.machineName);
    })
    .map((row) => [
      row.grain,
      row.bucketStartLocal,
      row.dateLocal,
      row.hourLocal || null,
      row.status,
      row.serviceType,
      row.paymentMethod,
      row.machineId,
      row.machineName,
      row.transactionCount,
      row.amountCentsSum,
      formatMoneyFromCents(row.amountCentsSum, currency),
      row.baseAmountCentsSum,
      formatMoneyFromCents(row.baseAmountCentsSum, currency),
      row.discountCentsSum,
      formatMoneyFromCents(row.discountCentsSum, currency),
      row.addonAmountCentsSum,
      formatMoneyFromCents(row.addonAmountCentsSum, currency)
    ]);

  const breakdownsCsv = buildCsv(
    [
      "grain",
      "bucket_start_local",
      "date_local",
      "hour_local",
      "status",
      "service_type",
      "payment_method",
      "machine_id",
      "machine_name",
      "transaction_count",
      "amount_cents_sum",
      "amount_sum",
      "base_amount_cents_sum",
      "base_amount_sum",
      "discount_cents_sum",
      "discount_sum",
      "addon_amount_cents_sum",
      "addon_amount_sum"
    ],
    breakdownRows
  );

  const totalsByStatus = new Map<string, { count: number; amountCents: number }>();
  const totalsByPayment = new Map<string, { count: number; amountCents: number }>();
  const totalsByService = new Map<string, { count: number; amountCents: number }>();
  let totalAmountCents = 0;
  for (const tx of transactions) {
    totalAmountCents += tx.amountCents;

    const statusTotals = totalsByStatus.get(tx.status) ?? { count: 0, amountCents: 0 };
    statusTotals.count += 1;
    statusTotals.amountCents += tx.amountCents;
    totalsByStatus.set(tx.status, statusTotals);

    const paymentTotals = totalsByPayment.get(tx.paymentMethod) ?? { count: 0, amountCents: 0 };
    paymentTotals.count += 1;
    paymentTotals.amountCents += tx.amountCents;
    totalsByPayment.set(tx.paymentMethod, paymentTotals);

    const serviceTotals = totalsByService.get(tx.serviceType) ?? { count: 0, amountCents: 0 };
    serviceTotals.count += 1;
    serviceTotals.amountCents += tx.amountCents;
    totalsByService.set(tx.serviceType, serviceTotals);
  }

  const metadataRows: Array<Array<unknown>> = [
    ["context", "from", range.from.toISOString()],
    ["context", "to", range.to.toISOString()],
    ["context", "timezone", timezone],
    ["context", "currency", currency],
    ["context", "generated_at", new Date().toISOString()],
    ["totals", "transaction_count", transactions.length],
    ["totals", "amount_cents_sum", totalAmountCents],
    ["totals", "amount_sum", formatMoneyFromCents(totalAmountCents, currency)]
  ];

  for (const [status, totals] of Array.from(totalsByStatus.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    metadataRows.push(["by_status", `${status}.transaction_count`, totals.count]);
    metadataRows.push(["by_status", `${status}.amount_cents_sum`, totals.amountCents]);
    metadataRows.push(["by_status", `${status}.amount_sum`, formatMoneyFromCents(totals.amountCents, currency)]);
  }
  for (const [paymentMethod, totals] of Array.from(totalsByPayment.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    metadataRows.push(["by_payment_method", `${paymentMethod}.transaction_count`, totals.count]);
    metadataRows.push(["by_payment_method", `${paymentMethod}.amount_cents_sum`, totals.amountCents]);
    metadataRows.push(["by_payment_method", `${paymentMethod}.amount_sum`, formatMoneyFromCents(totals.amountCents, currency)]);
  }
  for (const [serviceType, totals] of Array.from(totalsByService.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    metadataRows.push(["by_service_type", `${serviceType}.transaction_count`, totals.count]);
    metadataRows.push(["by_service_type", `${serviceType}.amount_cents_sum`, totals.amountCents]);
    metadataRows.push(["by_service_type", `${serviceType}.amount_sum`, formatMoneyFromCents(totals.amountCents, currency)]);
  }

  const metadataCsv = buildCsv(["section", "key", "value"], metadataRows);

  return {
    timezone,
    files: [
      { name: "transactions.csv", content: transactionsCsv },
      { name: "breakdowns.csv", content: breakdownsCsv },
      { name: "metadata_totals.csv", content: metadataCsv }
    ]
  };
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function msDosDateTime(input: Date) {
  const year = Math.max(1980, input.getUTCFullYear());
  const month = input.getUTCMonth() + 1;
  const day = input.getUTCDate();
  const hour = input.getUTCHours();
  const minute = input.getUTCMinutes();
  const second = Math.floor(input.getUTCSeconds() / 2);

  const dosTime = (hour << 11) | (minute << 5) | second;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosDate, dosTime };
}

function asUint8Array(chunks: Uint8Array[]) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function buildZipBundle(files: CsvFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const filename = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const checksum = crc32(content);
    const { dosDate, dosTime } = msDosDateTime(now);

    const localHeader = new Uint8Array(30 + filename.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, filename.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(filename, 30);

    localChunks.push(localHeader, content);

    const centralHeader = new Uint8Array(46 + filename.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, filename.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(filename, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + content.length;
  }

  const centralDir = asUint8Array(centralChunks);
  const localDir = asUint8Array(localChunks);

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDir.length, true);
  endView.setUint32(16, localDir.length, true);
  endView.setUint16(20, 0, true);

  return asUint8Array([localDir, centralDir, endRecord]);
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
