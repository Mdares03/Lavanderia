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
  status: "available" | "running" | "out_of_service";
  transaction: {
    id: string;
    ticketNumber: number;
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
    startedAt: string;
    expectedEndAt: string;
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
            in: [TRANSACTION_STATUS.running, TRANSACTION_STATUS.pendingRelay]
          }
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });

  return machines.map((machine) => {
    const runningTransaction = machine.transactions.at(0);
    const machineType = machine.type === "dryer" ? "dryer" : "washer";
    const status = machine.outOfService
      ? "out_of_service"
      : runningTransaction
        ? "running"
        : "available";

    return {
      id: machine.id,
      name: machine.name,
      type: machineType,
      relayChannel: machine.relayChannel,
      defaultPriceCents: machine.defaultPriceCents,
      defaultDurationMinutes: machine.defaultDurationMinutes,
      status,
      transaction: runningTransaction
        ? {
            id: runningTransaction.id,
            ticketNumber: runningTransaction.ticketNumber,
            customerId: runningTransaction.customerId,
            customerName: `${runningTransaction.customer.firstName} ${runningTransaction.customer.lastName}`.trim(),
            baseAmountCents: runningTransaction.baseAmountCents,
            discountCents: runningTransaction.discountCents,
            loyaltyDiscountApplied: runningTransaction.loyaltyDiscountApplied,
            addonDetergentQty: runningTransaction.addonDetergentQty,
            addonSoftenerQty: runningTransaction.addonSoftenerQty,
            addonBleachQty: runningTransaction.addonBleachQty,
            addonAmountCents: runningTransaction.addonAmountCents,
            serviceType:
              runningTransaction.serviceType === "encargo"
                ? "encargo"
                : runningTransaction.serviceType === "xl"
                  ? "xl"
                  : "autoservicio",
            amountCents: runningTransaction.amountCents,
            paymentMethod:
              runningTransaction.paymentMethod === "card"
                ? "card"
                : runningTransaction.paymentMethod === "transfer"
                  ? "transfer"
                  : "cash",
            startedAt: runningTransaction.startedAt.toISOString(),
            expectedEndAt: runningTransaction.expectedEndAt.toISOString(),
            employeeId: runningTransaction.employeeId
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
