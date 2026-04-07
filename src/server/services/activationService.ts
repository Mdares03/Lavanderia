import "server-only";

import { addMinutes } from "@/lib/time";
import { prisma } from "@/lib/db";
import { TRANSACTION_STATUS, type PaymentMethodValue, type ServiceTypeValue } from "@/server/domain/constants";
import { relayManager } from "@/server/relay/relayManager";
import { calculateAddonTotalCents, calculateLoyaltyDiscountCents } from "@/server/services/calculations";
import { timerService } from "@/server/services/timerService";

type ActivateMachineAddonsInput = {
  detergentQty: number;
  softenerQty: number;
  bleachQty: number;
};

export type ActivateMachineInput = {
  machineId: string;
  employeeId: string;
  customerId: string;
  baseAmountCents: number;
  durationMinutes: number;
  serviceType: ServiceTypeValue;
  paymentMethod: PaymentMethodValue;
  addons: ActivateMachineAddonsInput;
};

export async function activateMachine(input: ActivateMachineInput) {
  const startedAt = new Date();
  const expectedEndAt = addMinutes(startedAt, input.durationMinutes);

  const { machineRelayChannel, transaction } = await prisma.$transaction(async (tx) => {
    const machine = await tx.machine.findUnique({
      where: { id: input.machineId },
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

    if (!machine || !machine.isActive) {
      throw new Error("Maquina no disponible");
    }

    if (machine.outOfService) {
      throw new Error("Maquina fuera de servicio");
    }

    if (machine.transactions.length > 0) {
      throw new Error("Maquina actualmente en uso");
    }

    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, isActive: true }
    });

    if (!customer || !customer.isActive) {
      throw new Error("Cliente no disponible");
    }

    const config = await tx.appConfig.findUnique({
      where: { id: 1 },
      select: {
        loyaltyEveryNTransactions: true,
        loyaltyDiscountPct: true,
        detergentAddonCents: true,
        softenerAddonCents: true,
        bleachAddonCents: true
      }
    });

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
    const loyaltyDiscountApplied =
      loyaltyDiscountPct > 0 && customerTransactionNumber % loyaltyEveryNTransactions === 0;

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

    const ticketAgg = await tx.transaction.aggregate({
      _max: { ticketNumber: true }
    });
    const ticketNumber = (ticketAgg._max.ticketNumber ?? 0) + 1;

    const transaction = await tx.transaction.create({
      data: {
        ticketNumber,
        machineId: input.machineId,
        employeeId: input.employeeId,
        customerId: input.customerId,
        baseAmountCents: input.baseAmountCents,
        discountCents,
        loyaltyDiscountApplied,
        addonDetergentQty: input.addons.detergentQty,
        addonSoftenerQty: input.addons.softenerQty,
        addonBleachQty: input.addons.bleachQty,
        addonAmountCents,
        serviceType: input.serviceType,
        amountCents,
        paymentMethod: input.paymentMethod,
        startedAt,
        expectedEndAt,
        status: TRANSACTION_STATUS.pendingRelay
      }
    });

    return {
      machineRelayChannel: machine.relayChannel,
      transaction
    };
  });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { relayOnAttemptedAt: new Date() }
  });

  try {
    await relayManager.turnOn(machineRelayChannel);
    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TRANSACTION_STATUS.running,
        relayTurnedOnAt: new Date(),
        relayFailureReason: null
      },
      include: {
        customer: {
          select: { firstName: true, lastName: true, phone: true }
        },
        employee: {
          select: { name: true }
        },
        machine: {
          select: { name: true }
        }
      }
    });
    timerService.scheduleExpiry(updated.id, updated.expectedEndAt);
    return {
      transaction: updated,
      relayOk: true
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TRANSACTION_STATUS.relayFailed,
        relayFailureReason: message
      },
      include: {
        customer: {
          select: { firstName: true, lastName: true, phone: true }
        },
        employee: {
          select: { name: true }
        },
        machine: {
          select: { name: true }
        }
      }
    });
    return {
      transaction: updated,
      relayOk: false,
      relayError: message
    };
  }
}

export async function retryRelayOn(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { machine: true }
  });

  if (!transaction) {
    throw new Error("Transaccion no encontrada");
  }

  const retryableStatuses = new Set<string>([TRANSACTION_STATUS.relayFailed, TRANSACTION_STATUS.pendingRelay]);
  if (!retryableStatuses.has(transaction.status)) {
    throw new Error("Transaccion no elegible para reintento");
  }

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { relayOnAttemptedAt: new Date() }
  });

  await relayManager.turnOn(transaction.machine.relayChannel);
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: TRANSACTION_STATUS.running,
      relayTurnedOnAt: new Date(),
      relayFailureReason: null
    }
  });
  timerService.scheduleExpiry(updated.id, updated.expectedEndAt);
  return updated;
}

export async function addTimeToTransaction(input: {
  transactionId: string;
  employeeId: string;
  extraMinutes: number;
  extraAmountCents: number;
  reason?: string;
}) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId }
  });

  if (!transaction) {
    throw new Error("Transaccion no encontrada");
  }

  if (transaction.status !== TRANSACTION_STATUS.running) {
    throw new Error("Solo se puede agregar tiempo a transacciones activas");
  }

  const nextEnd = addMinutes(transaction.expectedEndAt, input.extraMinutes);
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      expectedEndAt: nextEnd,
      amountCents: transaction.amountCents + input.extraAmountCents,
      baseAmountCents: transaction.baseAmountCents + input.extraAmountCents
    }
  });

  await prisma.transactionExtension.create({
    data: {
      transactionId: transaction.id,
      employeeId: input.employeeId,
      extraMinutes: input.extraMinutes,
      extraAmountCents: input.extraAmountCents,
      reason: input.reason
    }
  });

  timerService.scheduleExpiry(updated.id, updated.expectedEndAt);
  return updated;
}

export async function voidTransaction(input: { transactionId: string; reason: string }) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    include: { machine: true }
  });

  if (!transaction) {
    throw new Error("Transaccion no encontrada");
  }

  if (transaction.status === TRANSACTION_STATUS.voided) {
    return transaction;
  }

  if (transaction.status === TRANSACTION_STATUS.running) {
    await relayManager.turnOff(transaction.machine.relayChannel);
  }
  timerService.unschedule(transaction.id);

  return prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: TRANSACTION_STATUS.voided,
      voidReason: input.reason,
      endedAt: new Date(),
      relayTurnedOffAt: new Date()
    }
  });
}
