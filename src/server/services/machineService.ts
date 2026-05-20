import "server-only";

import { prisma } from "@/lib/db";
import { TRANSACTION_STATUS } from "@/server/domain/constants";

export type DashboardMachine = {
  id: string;
  name: string;
  type: "washer" | "dryer";
  relayChannel: number;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  status: "available" | "running" | "finished" | "out_of_service";
  transaction: {
    id: string;
    ticketNumber: number;
    status: string;
    isExtension: boolean;
    parentTransactionId: string | null;
    customerId: string;
    customerName: string;
    baseAmountCents: number;
    discountCents: number;
    loyaltyDiscountApplied: boolean;
    addonDetergentQty: number;
    addonSoftenerQty: number;
    addonBleachQty: number;
    addonAmountCents: number;
    serviceType: "autoservicio" | "encargo" | "xl";
    amountCents: number;
    paymentMethod: "cash" | "card" | "transfer";
    originalDurationMinutes: number;
    extensionMinutes: number;
    extensionAmountCents: number;
    startedAt: string;
    expectedEndAt: string;
    endedAt: string | null;
    createdAt: string;
    voidedAt: string | null;
    voidReason: string | null;
    employeeId: string;
  } | null;
};

type ComboLabel = "ENCARGO" | "XL";

type ComboDescriptor = {
  number: number;
  label?: ComboLabel;
};

const DEFAULT_COMBOS: ComboDescriptor[] = [
  ...Array.from({ length: 12 }, (_, index) => ({
    number: index + 1
  })),
  { number: 13, label: "ENCARGO" },
  { number: 14, label: "ENCARGO" },
  { number: 15, label: "ENCARGO" },
  { number: 16, label: "XL" }
];

function toComboLabelText(label?: ComboLabel) {
  if (label === "ENCARGO") {
    return "Encargo";
  }
  if (label === "XL") {
    return "XL";
  }
  return "";
}

function buildDefaultMachineName(type: "washer" | "dryer", combo: ComboDescriptor) {
  const base = type === "washer" ? `Lavadora ${combo.number}` : `Secadora ${combo.number}`;
  const label = toComboLabelText(combo.label);
  return label ? `${base} (${label})` : base;
}

export async function ensureDefaultMachineCombos() {
  const existingMachines = await prisma.machine.findMany({
    select: {
      name: true,
      relayChannel: true
    },
    orderBy: { relayChannel: "asc" }
  });
  const usedNames = new Set(existingMachines.map((machine) => machine.name));

  const requiredNames = new Set<string>();
  for (const combo of DEFAULT_COMBOS) {
    requiredNames.add(buildDefaultMachineName("washer", combo));
    requiredNames.add(buildDefaultMachineName("dryer", combo));
  }
  const hasAllDefaultCombos = Array.from(requiredNames).every((name) => usedNames.has(name));
  if (hasAllDefaultCombos) {
    return;
  }

  const usedRelayChannels = new Set(existingMachines.map((machine) => machine.relayChannel));
  let nextRelayChannel = 0;

  function reserveRelayChannel() {
    while (usedRelayChannels.has(nextRelayChannel)) {
      nextRelayChannel += 1;
    }
    const value = nextRelayChannel;
    usedRelayChannels.add(value);
    nextRelayChannel += 1;
    return value;
  }

  const toCreate: Array<{
    name: string;
    type: "washer" | "dryer";
    relayChannel: number;
    defaultPriceCents: number;
    defaultDurationMinutes: number;
  }> = [];

  for (const combo of DEFAULT_COMBOS) {
    const washerName = buildDefaultMachineName("washer", combo);
    if (!usedNames.has(washerName)) {
      usedNames.add(washerName);
      toCreate.push({
        name: washerName,
        type: "washer",
        relayChannel: reserveRelayChannel(),
        defaultPriceCents: 8000,
        defaultDurationMinutes: 35
      });
    }

    const dryerName = buildDefaultMachineName("dryer", combo);
    if (!usedNames.has(dryerName)) {
      usedNames.add(dryerName);
      toCreate.push({
        name: dryerName,
        type: "dryer",
        relayChannel: reserveRelayChannel(),
        defaultPriceCents: 6000,
        defaultDurationMinutes: 45
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.machine.createMany({ data: toCreate });
  }
}

export async function getDashboardMachines(): Promise<DashboardMachine[]> {
  await ensureDefaultMachineCombos();

  const machines = await prisma.machine.findMany({
    where: { isActive: true },
    orderBy: { relayChannel: "asc" },
    include: {
      transactions: {
        where: {
          status: {
            in: [
              TRANSACTION_STATUS.running,
              TRANSACTION_STATUS.pendingRelay,
              TRANSACTION_STATUS.completed,
              TRANSACTION_STATUS.voided
            ]
          }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          extensions: {
            select: {
              extraMinutes: true,
              extraAmountCents: true
            }
          }
        }
      }
    }
  });

  return machines.map((machine) => {
    const runningTransaction = machine.transactions.find(
      (tx) => tx.status === TRANSACTION_STATUS.running || tx.status === TRANSACTION_STATUS.pendingRelay
    );
    const latestFinalized = machine.transactions.find(
      (tx) => tx.status === TRANSACTION_STATUS.completed || tx.status === TRANSACTION_STATUS.voided
    );
    const selectedTransaction = runningTransaction ?? (machine.awaitingRelease ? latestFinalized : undefined);
    const machineType = machine.type === "dryer" ? "dryer" : "washer";
    const status = machine.outOfService
      ? "out_of_service"
      : runningTransaction
        ? "running"
        : machine.awaitingRelease
          ? "finished"
          : "available";

    const extensionMinutes = selectedTransaction
      ? selectedTransaction.extensions.reduce((sum, row) => sum + row.extraMinutes, 0)
      : 0;
    const extensionAmountCents = selectedTransaction
      ? selectedTransaction.extensions.reduce((sum, row) => sum + row.extraAmountCents, 0)
      : 0;
    const totalDurationMinutes = selectedTransaction
      ? Math.max(
          1,
          Math.ceil((selectedTransaction.expectedEndAt.getTime() - selectedTransaction.startedAt.getTime()) / 60_000)
        )
      : 1;
    const originalDurationMinutes = Math.max(1, totalDurationMinutes - extensionMinutes);

    return {
      id: machine.id,
      name: machine.name,
      type: machineType,
      relayChannel: machine.relayChannel,
      defaultPriceCents: machine.defaultPriceCents,
      defaultDurationMinutes: machine.defaultDurationMinutes,
      status,
      transaction: selectedTransaction
        ? {
            id: selectedTransaction.id,
            ticketNumber: selectedTransaction.ticketNumber,
            status: selectedTransaction.status,
            isExtension: selectedTransaction.isExtension,
            parentTransactionId: selectedTransaction.parentTransactionId,
            customerId: selectedTransaction.customerId,
            customerName: `${selectedTransaction.customer.firstName} ${selectedTransaction.customer.lastName}`.trim(),
            baseAmountCents: selectedTransaction.baseAmountCents,
            discountCents: selectedTransaction.discountCents,
            loyaltyDiscountApplied: selectedTransaction.loyaltyDiscountApplied,
            addonDetergentQty: selectedTransaction.addonDetergentQty,
            addonSoftenerQty: selectedTransaction.addonSoftenerQty,
            addonBleachQty: selectedTransaction.addonBleachQty,
            addonAmountCents: selectedTransaction.addonAmountCents,
            serviceType:
              selectedTransaction.serviceType === "encargo"
                ? "encargo"
                : selectedTransaction.serviceType === "xl"
                  ? "xl"
                  : "autoservicio",
            amountCents: selectedTransaction.amountCents,
            paymentMethod:
              selectedTransaction.paymentMethod === "card"
                ? "card"
                : selectedTransaction.paymentMethod === "transfer"
                  ? "transfer"
                  : "cash",
            originalDurationMinutes,
            extensionMinutes,
            extensionAmountCents,
            startedAt: selectedTransaction.startedAt.toISOString(),
            expectedEndAt: selectedTransaction.expectedEndAt.toISOString(),
            endedAt: selectedTransaction.endedAt?.toISOString() ?? null,
            createdAt: selectedTransaction.createdAt.toISOString(),
            voidedAt: selectedTransaction.voidedAt?.toISOString() ?? null,
            voidReason: selectedTransaction.voidReason,
            employeeId: selectedTransaction.employeeId
          }
        : null
    };
  });
}

export async function updateMachineConfig(
  machineId: string,
  input: Partial<{
    name: string;
    relayChannel: number;
    defaultPriceCents: number;
    defaultDurationMinutes: number;
    outOfService: boolean;
    isActive: boolean;
  }>
) {
  return prisma.machine.update({
    where: { id: machineId },
    data: input
  });
}

export async function releaseMachine(machineId: string) {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
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

  if (!machine) {
    throw new Error("Maquina no encontrada");
  }
  if (machine.transactions.length > 0) {
    throw new Error("No se puede liberar una maquina en marcha");
  }

  return prisma.machine.update({
    where: { id: machineId },
    data: { awaitingRelease: false }
  });
}

export async function updateAllMachineDefaults(input: {
  defaultPriceCents?: number;
  defaultDurationMinutes?: number;
}) {
  if (input.defaultPriceCents === undefined && input.defaultDurationMinutes === undefined) {
    return { count: 0 };
  }
  return prisma.machine.updateMany({
    where: { isActive: true },
    data: input
  });
}
