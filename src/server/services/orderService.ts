import "server-only";

import { addMinutes } from "@/lib/time";
import { prisma } from "@/lib/db";
import { RelayApiError } from "@/lib/relay/types";
import {
  ENCARGO_ORDER_STATUS,
  TRANSACTION_STATUS,
  type PaymentMethodValue,
  type ServiceTypeValue
} from "@/server/domain/constants";
import { relayManager } from "@/server/relay/relayManager";
import { calculateAddonTotalCents, calculateLoyaltyDiscountCents } from "@/server/services/calculations";
import { getDrawerState } from "@/server/services/cashDropService";
import { getActiveShift } from "@/server/services/shiftService";
import { timerService } from "@/server/services/timerService";
import { queueAndPrintWorkOrderTickets } from "@/server/services/printerService";

type OrderAddonsInput = {
  detergentQty: number;
  softenerQty: number;
  bleachQty: number;
};

export type PreviewOrderInput = {
  weightKg: number;
  serviceType: ServiceTypeValue;
};

export type ProcessOrderInput = {
  employeeId: string;
  customerId: string;
  serviceType: ServiceTypeValue;
  paymentMethod: PaymentMethodValue;
  baseAmountCents: number;
  weightKg: number;
  encargoOrderId?: string;
  addons: OrderAddonsInput;
};

type WasherPlan = {
  machineId: string;
  machineName: string;
  machineSize: "normal" | "xl";
  relayChannel: number;
  capacityKg: number;
  durationMinutes: number;
  expectedEndAt: Date;
};

type DryerPlan = {
  machineId: string;
  machineName: string;
};

type LoadPlan = {
  loadIndex: number;
  washer: WasherPlan;
  dryer: DryerPlan | null;
};

type PlanResult = {
  requiredLoads: number;
  totalCapacityKg: number;
  loads: LoadPlan[];
  shortage: null | {
    requiredLoads: number;
    availableLoadsNow: number;
    etaWhenEnoughWashers: string | null;
  };
};

function centsSplit(total: number, count: number) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let rem = total % count;
  return Array.from({ length: count }, () => {
    const plus = rem > 0 ? 1 : 0;
    rem = Math.max(0, rem - 1);
    return base + plus;
  });
}

async function assertCashDrawerNotBlocked() {
  const activeShift = await getActiveShift();
  if (!activeShift) {
    return;
  }
  const drawerState = await getDrawerState(activeShift.id);
  if (drawerState.blockedAtCap) {
    throw new Error(
      `Caja al tope (${(drawerState.currentCashCents / 100).toFixed(2)} MXN). Registra un cash drop antes de vender de nuevo.`
    );
  }
}

async function buildWashPlan(input: PreviewOrderInput): Promise<PlanResult> {
  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: {
      washerNormalCapacityKg: true,
      washerXlCapacityKg: true,
      dryerNormalCycleMinutes: true,
      dryerXlCycleMinutes: true
    }
  });

  if (!config) {
    throw new Error("Configuracion no disponible");
  }

  const [machines, relayStatuses] = await Promise.all([
    prisma.machine.findMany({
      where: {
        type: "washer",
        isActive: true
      },
      orderBy: [{ size: "asc" }, { relayChannel: "asc" }, { createdAt: "asc" }],
      include: {
        transactions: {
          where: {
            status: {
              in: [TRANSACTION_STATUS.running, TRANSACTION_STATUS.pendingRelay]
            }
          },
          select: {
            expectedEndAt: true
          },
          orderBy: {
            expectedEndAt: "asc"
          },
          take: 1
        }
      }
    }),
    relayManager.getAllRelayStatuses().catch(() => [])
  ]);

  const relayByChannel = new Map(relayStatuses.map((row) => [row.channel, row]));
  const now = new Date();

  const rows = machines
    .filter((machine) => !machine.outOfService && machine.relayChannel !== null && !machine.awaitingRelease)
    .map((machine) => {
      const relayInfo = machine.relayChannel ? relayByChannel.get(machine.relayChannel) : undefined;
      const ready = !!relayInfo && relayInfo.enabled && relayInfo.backend !== "pending" && !relayInfo.error;
      const running = machine.transactions.length > 0;
      const availableAt = running ? machine.transactions[0]!.expectedEndAt : now;
      const capacityKg = machine.size === "xl" ? config.washerXlCapacityKg : config.washerNormalCapacityKg;
      return {
        machineId: machine.id,
        machineName: machine.name,
        machineSize: machine.size === "xl" ? ("xl" as const) : ("normal" as const),
        relayChannel: machine.relayChannel!,
        ready,
        running,
        availableAt,
        capacityKg,
        durationMinutes: machine.defaultDurationMinutes
      };
    });

  const availableNow = rows
    .filter((row) => row.ready && !row.running)
    .sort((a, b) => {
      if (a.machineSize !== b.machineSize) {
        return a.machineSize === "normal" ? -1 : 1;
      }
      return a.relayChannel - b.relayChannel;
    });

  const selectedNow: typeof availableNow = [];
  let remainingKg = input.weightKg;

  for (const row of availableNow.filter((item) => item.machineSize === "normal")) {
    if (remainingKg <= 0) break;
    selectedNow.push(row);
    remainingKg -= row.capacityKg;
  }

  for (const row of availableNow.filter((item) => item.machineSize === "xl")) {
    if (remainingKg <= 0) break;
    selectedNow.push(row);
    remainingKg -= row.capacityKg;
  }

  const totalCapacityKg = selectedNow.reduce((sum, item) => sum + item.capacityKg, 0);

  if (remainingKg > 0) {
    const requiredLoads = Math.max(1, Math.ceil(input.weightKg / Math.max(config.washerNormalCapacityKg, 0.1)));
    const availableLoadsNow = selectedNow.length;

    let projectedCapacity = totalCapacityKg;
    let eta: Date | null = null;

    const upcoming = rows
      .filter((row) => row.ready && row.running)
      .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());

    for (const row of upcoming) {
      projectedCapacity += row.capacityKg;
      if (projectedCapacity >= input.weightKg) {
        eta = row.availableAt;
        break;
      }
    }

    return {
      requiredLoads,
      totalCapacityKg,
      loads: [],
      shortage: {
        requiredLoads,
        availableLoadsNow,
        etaWhenEnoughWashers: eta ? eta.toISOString() : null
      }
    };
  }

  const loads: LoadPlan[] = selectedNow.map((row, index) => ({
    loadIndex: index + 1,
    washer: {
      machineId: row.machineId,
      machineName: row.machineName,
      machineSize: row.machineSize,
      relayChannel: row.relayChannel,
      capacityKg: row.capacityKg,
      durationMinutes: row.durationMinutes,
      expectedEndAt: addMinutes(now, row.durationMinutes)
    },
    dryer: null
  }));

  if (input.serviceType === "encargo") {
    const dryers = await prisma.machine.findMany({
      where: {
        type: "dryer",
        isActive: true,
        outOfService: false,
        awaitingRelease: false
      },
      orderBy: [{ relayChannel: "asc" }, { createdAt: "asc" }],
      include: {
        transactions: {
          where: {
            status: {
              in: [TRANSACTION_STATUS.running, TRANSACTION_STATUS.pendingRelay]
            }
          },
          select: { expectedEndAt: true },
          orderBy: { expectedEndAt: "asc" },
          take: 1
        }
      }
    });

    const dryerState = dryers.map((dryer) => ({
      machineId: dryer.id,
      machineName: dryer.name,
      availableAt: dryer.transactions[0]?.expectedEndAt ?? now,
      durationMinutes: dryer.defaultDurationMinutes
    }));

    for (const load of loads) {
      if (dryerState.length === 0) {
        break;
      }
      let bestIndex = 0;
      let bestStartAt = new Date(Math.max(dryerState[0]!.availableAt.getTime(), load.washer.expectedEndAt.getTime()));

      for (let index = 1; index < dryerState.length; index += 1) {
        const candidate = dryerState[index]!;
        const startAt = new Date(Math.max(candidate.availableAt.getTime(), load.washer.expectedEndAt.getTime()));
        if (startAt.getTime() < bestStartAt.getTime()) {
          bestStartAt = startAt;
          bestIndex = index;
        }
      }

      const chosen = dryerState[bestIndex]!;
      load.dryer = {
        machineId: chosen.machineId,
        machineName: chosen.machineName
      };
      chosen.availableAt = addMinutes(bestStartAt, chosen.durationMinutes);
    }
  }

  return {
    requiredLoads: loads.length,
    totalCapacityKg,
    loads,
    shortage: null
  };
}

export async function previewOrderProcess(input: PreviewOrderInput) {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    throw new Error("Peso invalido");
  }

  const plan = await buildWashPlan(input);

  return {
    canProcess: !plan.shortage,
    requiredLoads: plan.requiredLoads,
    totalCapacityKg: Number(plan.totalCapacityKg.toFixed(2)),
    assignments: plan.loads.map((load) => ({
      loadIndex: load.loadIndex,
      washer: {
        machineId: load.washer.machineId,
        machineName: load.washer.machineName,
        machineSize: load.washer.machineSize,
        capacityKg: load.washer.capacityKg,
        expectedEndAt: load.washer.expectedEndAt.toISOString()
      },
      dryer: load.dryer
        ? {
            machineId: load.dryer.machineId,
            machineName: load.dryer.machineName
          }
        : null
    })),
    shortage: plan.shortage
  };
}

export async function processOrder(input: ProcessOrderInput) {
  await assertCashDrawerNotBlocked();

  const plan = await buildWashPlan({
    weightKg: input.weightKg,
    serviceType: input.serviceType
  });

  if (plan.shortage) {
    const error = new Error("No hay suficientes lavadoras disponibles para procesar la orden");
    (error as Error & { code?: string; detail?: unknown }).code = "insufficient_washers";
    (error as Error & { code?: string; detail?: unknown }).detail = plan.shortage;
    throw error;
  }

  const startedAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const [employee, customer, config] = await Promise.all([
      tx.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, name: true, isActive: true } }),
      tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, firstName: true, lastName: true, isActive: true } }),
      tx.appConfig.findUnique({
        where: { id: 1 },
        select: {
          loyaltyEveryNTransactions: true,
          loyaltyDiscountPct: true,
          detergentAddonCents: true,
          softenerAddonCents: true,
          bleachAddonCents: true
        }
      })
    ]);

    if (!employee || !employee.isActive) {
      throw new Error("Empleado no valido");
    }
    if (!customer || !customer.isActive) {
      throw new Error("Cliente no disponible");
    }
    if (!config) {
      throw new Error("Configuracion no disponible");
    }

    const priorEligibleTransactions = await tx.transaction.count({
      where: {
        customerId: input.customerId,
        status: {
          in: [TRANSACTION_STATUS.pendingRelay, TRANSACTION_STATUS.running, TRANSACTION_STATUS.completed]
        }
      }
    });

    const customerTransactionNumber = priorEligibleTransactions + 1;
    const loyaltyEveryNTransactions = Math.max(1, config.loyaltyEveryNTransactions);
    const loyaltyDiscountPct = Math.max(0, Math.min(100, config.loyaltyDiscountPct));
    const loyaltyDiscountApplied = loyaltyDiscountPct > 0 && customerTransactionNumber % loyaltyEveryNTransactions === 0;

    const discountCents = loyaltyDiscountApplied
      ? calculateLoyaltyDiscountCents(input.baseAmountCents, loyaltyDiscountPct)
      : 0;

    const addonAmountCents = calculateAddonTotalCents({
      detergentQty: input.addons.detergentQty,
      softenerQty: input.addons.softenerQty,
      bleachQty: input.addons.bleachQty,
      detergentAddonCents: config.detergentAddonCents,
      softenerAddonCents: config.softenerAddonCents,
      bleachAddonCents: config.bleachAddonCents
    });

    const amountCents = Math.max(0, input.baseAmountCents - discountCents + addonAmountCents);

    const [ticketAgg, orderAgg] = await Promise.all([
      tx.transaction.aggregate({ _max: { ticketNumber: true } }),
      tx.workOrder.aggregate({ _max: { orderNumber: true } })
    ]);

    const firstTicketNumber = (ticketAgg._max.ticketNumber ?? 0) + 1;
    const nextOrderNumber = (orderAgg._max.orderNumber ?? 0) + 1;

    const workOrder = await tx.workOrder.create({
      data: {
        orderNumber: nextOrderNumber,
        employeeId: employee.id,
        customerId: customer.id,
        encargoOrderId: input.encargoOrderId,
        serviceType: input.serviceType,
        paymentMethod: input.paymentMethod,
        weightKg: input.weightKg,
        requiredLoads: plan.loads.length,
        baseAmountCents: input.baseAmountCents,
        discountCents,
        loyaltyDiscountApplied,
        addonDetergentQty: input.addons.detergentQty,
        addonSoftenerQty: input.addons.softenerQty,
        addonBleachQty: input.addons.bleachQty,
        addonAmountCents,
        amountCents,
        status: "created"
      }
    });

    if (input.encargoOrderId) {
      const encargoOrder = await tx.encargoOrder.findUnique({
        where: { id: input.encargoOrderId },
        select: { id: true, status: true }
      });

      if (!encargoOrder) {
        throw new Error("Encargo no encontrado");
      }
      if (encargoOrder.status === ENCARGO_ORDER_STATUS.pickedUp) {
        throw new Error("No se puede procesar un encargo entregado");
      }

      await tx.encargoOrder.update({
        where: { id: encargoOrder.id },
        data: { status: ENCARGO_ORDER_STATUS.processing }
      });
    }

    const baseSplits = centsSplit(input.baseAmountCents, plan.loads.length);
    const discountSplits = centsSplit(discountCents, plan.loads.length);
    const addonSplits = centsSplit(addonAmountCents, plan.loads.length);

    const createdLoads: Array<{ id: string; plan: LoadPlan }> = [];
    const createdTransactions: Array<{
      id: string;
      machineId: string;
      relayChannel: number;
      expectedEndAt: Date;
      ticketNumber: number;
    }> = [];

    for (const [index, load] of plan.loads.entries()) {
      const createdLoad = await tx.workOrderLoad.create({
        data: {
          workOrderId: workOrder.id,
          loadIndex: load.loadIndex,
          washerMachineId: load.washer.machineId,
          dryerMachineId: load.dryer?.machineId ?? null,
          status: "assigned"
        }
      });

      const machine = await tx.machine.findUnique({
        where: { id: load.washer.machineId },
        include: {
          transactions: {
            where: {
              status: {
                in: [TRANSACTION_STATUS.running, TRANSACTION_STATUS.pendingRelay]
              }
            },
            take: 1
          }
        }
      });

      if (!machine || !machine.isActive || machine.outOfService || machine.awaitingRelease) {
        throw new Error(`Lavadora no disponible: ${load.washer.machineName}`);
      }
      if (machine.transactions.length > 0) {
        throw new Error(`Lavadora en uso: ${load.washer.machineName}`);
      }
      if (machine.relayChannel === null) {
        throw new Error(`Lavadora sin canal: ${load.washer.machineName}`);
      }

      const ticketNumber = firstTicketNumber + index;
      const baseAmount = baseSplits[index] ?? 0;
      const discount = discountSplits[index] ?? 0;
      const addons = addonSplits[index] ?? 0;
      const total = Math.max(0, baseAmount - discount + addons);
      const expectedEndAt = addMinutes(startedAt, machine.defaultDurationMinutes);

      const transaction = await tx.transaction.create({
        data: {
          ticketNumber,
          machineId: machine.id,
          employeeId: employee.id,
          customerId: customer.id,
          baseAmountCents: baseAmount,
          discountCents: discount,
          loyaltyDiscountApplied: discount > 0,
          addonDetergentQty: index === 0 ? input.addons.detergentQty : 0,
          addonSoftenerQty: index === 0 ? input.addons.softenerQty : 0,
          addonBleachQty: index === 0 ? input.addons.bleachQty : 0,
          addonAmountCents: addons,
          serviceType: input.serviceType,
          amountCents: total,
          paymentMethod: input.paymentMethod,
          encargoOrderId: input.encargoOrderId,
          workOrderId: workOrder.id,
          workOrderLoadId: createdLoad.id,
          startedAt,
          expectedEndAt,
          status: TRANSACTION_STATUS.pendingRelay
        }
      });

      createdLoads.push({ id: createdLoad.id, plan: load });
      createdTransactions.push({
        id: transaction.id,
        machineId: machine.id,
        relayChannel: machine.relayChannel,
        expectedEndAt,
        ticketNumber
      });
    }

    return {
      workOrder,
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      cashierName: employee.name,
      createdLoads,
      createdTransactions,
      amountCents,
      discountCents,
      addonAmountCents
    };
  });

  const relayFailures: Array<{ transactionId: string; ticketNumber: number; error: string }> = [];

  for (const txRow of created.createdTransactions) {
    await prisma.transaction.update({
      where: { id: txRow.id },
      data: { relayOnAttemptedAt: new Date() }
    });

    try {
      await relayManager.assertChannelReady(txRow.relayChannel);
      await relayManager.turnOn(txRow.relayChannel);
      await prisma.transaction.update({
        where: { id: txRow.id },
        data: {
          status: TRANSACTION_STATUS.running,
          relayTurnedOnAt: new Date(),
          relayFailureReason: null
        }
      });
      timerService.scheduleExpiry(txRow.id, txRow.expectedEndAt);
    } catch (error) {
      const message =
        error instanceof RelayApiError && error.code === "channel_not_wired"
          ? "Esta maquina todavia no esta conectada al sistema."
          : error instanceof Error
            ? error.message
            : String(error);
      relayFailures.push({
        transactionId: txRow.id,
        ticketNumber: txRow.ticketNumber,
        error: message
      });
      await prisma.transaction.update({
        where: { id: txRow.id },
        data: {
          status: TRANSACTION_STATUS.relayFailed,
          relayFailureReason: message
        }
      });
    }
  }

  const printResult = await queueAndPrintWorkOrderTickets({
    workOrderId: created.workOrder.id,
    orderNumber: created.workOrder.orderNumber,
    serviceType: created.workOrder.serviceType,
    customerName: created.customerName,
    cashierName: created.cashierName,
    paymentMethod: created.workOrder.paymentMethod,
    createdAt: created.workOrder.createdAt,
    weightKg: created.workOrder.weightKg,
    requiredLoads: created.workOrder.requiredLoads,
    baseAmountCents: created.workOrder.baseAmountCents,
    discountCents: created.workOrder.discountCents,
    addonAmountCents: created.workOrder.addonAmountCents,
    amountCents: created.workOrder.amountCents,
    loads: created.createdLoads.map((row) => ({
      loadIndex: row.plan.loadIndex,
      washerName: row.plan.washer.machineName,
      dryerName: row.plan.dryer?.machineName ?? null
    }))
  });

  const workOrderFull = await prisma.workOrder.findUnique({
    where: { id: created.workOrder.id },
    include: {
      loads: {
        include: {
          washerMachine: {
            select: {
              id: true,
              name: true,
              size: true
            }
          },
          dryerMachine: {
            select: {
              id: true,
              name: true,
              size: true
            }
          },
          transaction: {
            select: {
              id: true,
              ticketNumber: true,
              status: true,
              amountCents: true,
              expectedEndAt: true
            }
          }
        },
        orderBy: { loadIndex: "asc" }
      },
      printJobs: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  return {
    workOrder: workOrderFull,
    relayFailures,
    printFailures: printResult.failedJobs
  };
}
