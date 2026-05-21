import "server-only";

import { prisma } from "@/lib/db";
import { RelayApiError, type RelayChannelStatus } from "@/lib/relay/types";
import { TRANSACTION_STATUS } from "@/server/domain/constants";
import { relayManager } from "@/server/relay/relayManager";

type MachineType = "washer" | "dryer";
type MachineSize = "normal" | "xl";

type RelayTestMeta = {
  lastRelayTestOk: boolean | null;
  lastRelayTestAt: string | null;
  lastRelayTestError: string | null;
  hardwareValidatedAt: string | null;
};

export type DashboardMachine = {
  id: string;
  name: string;
  type: MachineType;
  size: MachineSize;
  relayChannel: number;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  status: "available" | "running" | "finished" | "out_of_service" | "pending_hardware";
  hardware: {
    enabled: boolean;
    backend: "i2c" | "modbus" | "pending";
    state: boolean | null;
    ready: boolean;
    error?: string;
  };
  relayTest: RelayTestMeta;
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

export type AdminMachine = {
  id: string;
  name: string;
  type: MachineType;
  size: MachineSize;
  relayChannel: number | null;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  outOfService: boolean;
  isActive: boolean;
  awaitingRelease: boolean;
  relayTest: RelayTestMeta;
  hardware: {
    enabled: boolean;
    backend: "i2c" | "modbus" | "pending";
    state: boolean | null;
    ready: boolean;
    error?: string;
  };
  status: "available" | "running" | "finished" | "out_of_service" | "pending_hardware";
};

type CreateMachineAdminInput = {
  name: string;
  type: MachineType;
  size?: MachineSize;
  relayChannel?: number | null;
  defaultPriceCents: number;
  defaultDurationMinutes?: number;
  outOfService?: boolean;
  isActive?: boolean;
};

type UpdateMachineAdminInput = Partial<{
  name: string;
  type: MachineType;
  size: MachineSize;
  relayChannel: number | null;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  outOfService: boolean;
  isActive: boolean;
}>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMachineType(value: string): MachineType {
  return value === "dryer" ? "dryer" : "washer";
}

function normalizeMachineSize(rawName: string, value?: string): MachineSize {
  if (value === "xl") {
    return "xl";
  }
  if (rawName.toUpperCase().includes("(XL)")) {
    return "xl";
  }
  return "normal";
}

function toRelayTestMeta(input: {
  lastRelayTestOk: boolean | null;
  lastRelayTestAt: Date | null;
  lastRelayTestError: string | null;
  hardwareValidatedAt: Date | null;
}): RelayTestMeta {
  return {
    lastRelayTestOk: input.lastRelayTestOk,
    lastRelayTestAt: input.lastRelayTestAt?.toISOString() ?? null,
    lastRelayTestError: input.lastRelayTestError,
    hardwareValidatedAt: input.hardwareValidatedAt?.toISOString() ?? null
  };
}

function calculateHardware(
  relayInfo: RelayChannelStatus | undefined,
  relayStatusUnavailable: boolean,
  relayChannel: number | null
) {
  const ready = !!relayInfo && relayInfo.enabled && relayInfo.backend !== "pending" && !relayInfo.error;
  const error =
    relayInfo?.error ??
    (relayStatusUnavailable ? "relay_api_unavailable" : relayChannel === null ? "channel_unassigned" : relayInfo ? undefined : "channel_unmapped");
  return {
    enabled: relayInfo?.enabled ?? false,
    backend: relayInfo?.backend ?? "pending",
    state: relayInfo?.state ?? null,
    ready,
    error
  };
}

function deriveStatus(input: {
  outOfService: boolean;
  running: boolean;
  awaitingRelease: boolean;
  hardwareReady: boolean;
}) {
  if (input.outOfService) {
    return "out_of_service" as const;
  }
  if (input.running) {
    return "running" as const;
  }
  if (input.awaitingRelease) {
    return "finished" as const;
  }
  if (input.hardwareReady) {
    return "available" as const;
  }
  return "pending_hardware" as const;
}

async function getRelayStatusMap() {
  let relayStatusUnavailable = false;
  let relayStatuses = new Map<number, RelayChannelStatus>();
  try {
    const statusRows = await relayManager.getAllRelayStatuses();
    relayStatuses = new Map(statusRows.map((row) => [row.channel, row]));
  } catch {
    relayStatusUnavailable = true;
  }
  return { relayStatuses, relayStatusUnavailable };
}

async function getCycleDurationDefaults() {
  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: {
      washerNormalCycleMinutes: true,
      washerXlCycleMinutes: true,
      dryerNormalCycleMinutes: true,
      dryerXlCycleMinutes: true
    }
  });

  return {
    washerNormalCycleMinutes: config?.washerNormalCycleMinutes ?? 35,
    washerXlCycleMinutes: config?.washerXlCycleMinutes ?? 45,
    dryerNormalCycleMinutes: config?.dryerNormalCycleMinutes ?? 45,
    dryerXlCycleMinutes: config?.dryerXlCycleMinutes ?? 55
  };
}

function defaultDurationFor(type: MachineType, size: MachineSize, defaults: {
  washerNormalCycleMinutes: number;
  washerXlCycleMinutes: number;
  dryerNormalCycleMinutes: number;
  dryerXlCycleMinutes: number;
}) {
  if (type === "washer") {
    return size === "xl" ? defaults.washerXlCycleMinutes : defaults.washerNormalCycleMinutes;
  }
  return size === "xl" ? defaults.dryerXlCycleMinutes : defaults.dryerNormalCycleMinutes;
}

async function ensureRelayChannelUnique(relayChannel: number, excludeMachineId?: string) {
  const existing = await prisma.machine.findFirst({
    where: {
      relayChannel,
      ...(excludeMachineId ? { id: { not: excludeMachineId } } : {})
    },
    select: {
      id: true,
      name: true
    }
  });

  if (existing) {
    throw new Error(`El canal ${relayChannel} ya esta asignado a ${existing.name}`);
  }
}

async function validateMachineActivation(input: {
  machineId?: string;
  relayChannel: number | null;
  isActive: boolean;
}) {
  if (input.relayChannel !== null) {
    if (!Number.isInteger(input.relayChannel) || input.relayChannel < 1 || input.relayChannel > 63) {
      throw new Error("Canal de relay invalido. Usa un valor entre 1 y 63.");
    }
    await ensureRelayChannelUnique(input.relayChannel, input.machineId);
  }

  if (!input.isActive) {
    return;
  }

  if (input.relayChannel === null) {
    throw new Error("Una maquina activa requiere canal de relay asignado");
  }

  try {
    await relayManager.assertChannelReady(input.relayChannel);
  } catch (error) {
    if (error instanceof RelayApiError && error.code === "channel_not_wired") {
      throw new Error(`Canal ${input.relayChannel} pendiente de hardware. Prueba relay despues de cablear.`);
    }
    throw error;
  }
}

type ComboLabel = "XL";

type ComboDescriptor = {
  number: number;
  label?: ComboLabel;
};

const DEFAULT_COMBOS: ComboDescriptor[] = [
  ...Array.from({ length: 12 }, (_, index) => ({
    number: index + 1
  })),
  { number: 13, label: "XL" }
];

function buildDefaultMachineName(type: MachineType, combo: ComboDescriptor) {
  const base = type === "washer" ? `Lavadora ${combo.number}` : `Secadora ${combo.number}`;
  return combo.label ? `${base} (${combo.label})` : base;
}

export async function ensureInitialMachineCatalogSeed() {
  const existingMachineCount = await prisma.machine.count();
  if (existingMachineCount > 0) {
    return;
  }

  const cycleDefaults = await getCycleDurationDefaults();
  const targetMachines = [
    ...DEFAULT_COMBOS.map((combo, index) => ({
      name: buildDefaultMachineName("washer", combo),
      type: "washer" as const,
      size: combo.label === "XL" ? "xl" as const : "normal" as const,
      relayChannel: index + 1,
      defaultPriceCents: 8000,
      defaultDurationMinutes: defaultDurationFor("washer", combo.label === "XL" ? "xl" : "normal", cycleDefaults)
    })),
    ...DEFAULT_COMBOS.map((combo, index) => ({
      name: buildDefaultMachineName("dryer", combo),
      type: "dryer" as const,
      size: combo.label === "XL" ? "xl" as const : "normal" as const,
      relayChannel: index + DEFAULT_COMBOS.length + 1,
      defaultPriceCents: 6000,
      defaultDurationMinutes: defaultDurationFor("dryer", combo.label === "XL" ? "xl" : "normal", cycleDefaults)
    }))
  ];

  await prisma.machine.createMany({
    data: targetMachines
  });
}

export async function getDashboardMachines(): Promise<DashboardMachine[]> {
  await ensureInitialMachineCatalogSeed();
  const { relayStatuses, relayStatusUnavailable } = await getRelayStatusMap();

  const machines = await prisma.machine.findMany({
    where: { isActive: true },
    orderBy: [{ relayChannel: "asc" }, { createdAt: "asc" }],
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

  return machines.reduce<DashboardMachine[]>((acc, machine) => {
      if (machine.relayChannel === null) {
        return acc;
      }
      const runningTransaction = machine.transactions.find(
        (tx) => tx.status === TRANSACTION_STATUS.running || tx.status === TRANSACTION_STATUS.pendingRelay
      );
      const latestFinalized = machine.transactions.find(
        (tx) => tx.status === TRANSACTION_STATUS.completed || tx.status === TRANSACTION_STATUS.voided
      );
      const selectedTransaction = runningTransaction ?? (machine.awaitingRelease ? latestFinalized : undefined);
      const relayInfo = machine.relayChannel ? relayStatuses.get(machine.relayChannel) : undefined;
      const hardware = calculateHardware(relayInfo, relayStatusUnavailable, machine.relayChannel);
      const status = deriveStatus({
        outOfService: machine.outOfService,
        running: !!runningTransaction,
        awaitingRelease: machine.awaitingRelease,
        hardwareReady: hardware.ready
      });

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

      acc.push({
        id: machine.id,
        name: machine.name,
        type: normalizeMachineType(machine.type),
        size: machine.size === "xl" ? "xl" : "normal",
        relayChannel: machine.relayChannel,
        defaultPriceCents: machine.defaultPriceCents,
        defaultDurationMinutes: machine.defaultDurationMinutes,
        status,
        hardware,
        relayTest: toRelayTestMeta(machine),
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
      });

      return acc;
    }, []);
}

export async function listAdminMachines(): Promise<AdminMachine[]> {
  await ensureInitialMachineCatalogSeed();
  const { relayStatuses, relayStatusUnavailable } = await getRelayStatusMap();

  const machines = await prisma.machine.findMany({
    orderBy: [{ isActive: "desc" }, { relayChannel: "asc" }, { createdAt: "asc" }],
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

  return machines.map((machine) => {
    const relayInfo = machine.relayChannel ? relayStatuses.get(machine.relayChannel) : undefined;
    const hardware = calculateHardware(relayInfo, relayStatusUnavailable, machine.relayChannel);
    const status = deriveStatus({
      outOfService: machine.outOfService,
      running: machine.transactions.length > 0,
      awaitingRelease: machine.awaitingRelease,
      hardwareReady: hardware.ready
    });

    return {
      id: machine.id,
      name: machine.name,
      type: normalizeMachineType(machine.type),
      size: machine.size === "xl" ? "xl" : "normal",
      relayChannel: machine.relayChannel,
      defaultPriceCents: machine.defaultPriceCents,
      defaultDurationMinutes: machine.defaultDurationMinutes,
      outOfService: machine.outOfService,
      isActive: machine.isActive,
      awaitingRelease: machine.awaitingRelease,
      relayTest: toRelayTestMeta(machine),
      hardware,
      status
    };
  });
}

export async function createMachineAdmin(input: CreateMachineAdminInput) {
  const cycleDefaults = await getCycleDurationDefaults();
  const type = normalizeMachineType(input.type);
  const size = normalizeMachineSize(input.name, input.size);
  const relayChannel = input.relayChannel ?? null;
  const isActive = input.isActive ?? false;

  await validateMachineActivation({
    relayChannel,
    isActive
  });

  const defaultDurationMinutes =
    input.defaultDurationMinutes ?? defaultDurationFor(type, size, cycleDefaults);

  const now = new Date();
  return prisma.machine.create({
    data: {
      name: input.name,
      type,
      size,
      relayChannel,
      defaultPriceCents: input.defaultPriceCents,
      defaultDurationMinutes,
      outOfService: input.outOfService ?? false,
      isActive,
      hardwareValidatedAt: isActive ? now : null
    }
  });
}

export async function updateMachineAdmin(machineId: string, input: UpdateMachineAdminInput) {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId }
  });

  if (!machine) {
    throw new Error("Maquina no encontrada");
  }

  const nextName = input.name ?? machine.name;
  const nextType = normalizeMachineType(input.type ?? machine.type);
  const nextSize = normalizeMachineSize(nextName, input.size ?? machine.size);
  const nextRelayChannel = input.relayChannel === undefined ? machine.relayChannel : input.relayChannel;
  const nextIsActive = input.isActive ?? machine.isActive;

  await validateMachineActivation({
    machineId,
    relayChannel: nextRelayChannel,
    isActive: nextIsActive
  });

  const relayChanged = input.relayChannel !== undefined && input.relayChannel !== machine.relayChannel;
  const activatedNow = !machine.isActive && nextIsActive;

  return prisma.machine.update({
    where: { id: machineId },
    data: {
      name: nextName,
      type: nextType,
      size: nextSize,
      relayChannel: nextRelayChannel,
      defaultPriceCents: input.defaultPriceCents,
      defaultDurationMinutes: input.defaultDurationMinutes,
      outOfService: input.outOfService,
      isActive: nextIsActive,
      hardwareValidatedAt: activatedNow ? new Date() : undefined,
      ...(relayChanged
        ? {
            lastRelayTestOk: null,
            lastRelayTestAt: null,
            lastRelayTestError: null,
            hardwareValidatedAt: null
          }
        : {})
    }
  });
}

export async function softRemoveMachineAdmin(machineId: string) {
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
    throw new Error("No se puede remover una maquina en marcha");
  }

  return prisma.machine.update({
    where: { id: machineId },
    data: {
      isActive: false,
      outOfService: false,
      awaitingRelease: false,
      relayChannel: null
    }
  });
}

export async function testMachineRelayAndOptionallyActivate(machineId: string, autoActivate = true) {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { id: true, relayChannel: true, isActive: true }
  });

  if (!machine) {
    throw new Error("Maquina no encontrada");
  }

  if (machine.relayChannel === null) {
    throw new Error("La maquina no tiene canal de relay asignado");
  }

  try {
    await relayManager.assertChannelReady(machine.relayChannel);
    await relayManager.turnOn(machine.relayChannel);
    await sleep(2_000);
    await relayManager.turnOff(machine.relayChannel);

    const updated = await prisma.machine.update({
      where: { id: machineId },
      data: {
        lastRelayTestOk: true,
        lastRelayTestAt: new Date(),
        lastRelayTestError: null,
        hardwareValidatedAt: new Date(),
        ...(autoActivate ? { isActive: true } : {})
      }
    });

    return {
      machine: updated,
      success: true,
      activated: autoActivate && !machine.isActive
    };
  } catch (error) {
    await prisma.machine.update({
      where: { id: machineId },
      data: {
        lastRelayTestOk: false,
        lastRelayTestAt: new Date(),
        lastRelayTestError: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

export async function saveMachineRelayTestResult(input: {
  machineId: string;
  success: boolean;
  error?: string;
}) {
  await prisma.machine.update({
    where: { id: input.machineId },
    data: {
      lastRelayTestOk: input.success,
      lastRelayTestAt: new Date(),
      lastRelayTestError: input.success ? null : input.error ?? "Relay test failed",
      hardwareValidatedAt: input.success ? new Date() : undefined
    }
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
