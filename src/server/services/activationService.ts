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
import { writeAuditEvent } from "@/server/services/auditLog";
import { loginWithPin } from "@/server/services/authService";
import { calculateAddonTotalCents, calculateLoyaltyDiscountCents } from "@/server/services/calculations";
import { getDrawerState } from "@/server/services/cashDropService";
import { getActiveShift } from "@/server/services/shiftService";
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
  encargoOrderId?: string;
  addons: ActivateMachineAddonsInput;
};

export async function activateMachine(input: ActivateMachineInput) {
  const activeShift = await getActiveShift();
  if (activeShift) {
    const drawerState = await getDrawerState(activeShift.id);
    if (drawerState.blockedAtCap) {
      throw new Error(
        `Caja al tope (${(drawerState.currentCashCents / 100).toFixed(2)} MXN). Registra un cash drop antes de vender de nuevo.`
      );
    }
  }

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

    if (machine.awaitingRelease) {
      throw new Error("La maquina tiene ciclo terminado. Libera la maquina antes de reactivar.");
    }

    if (machine.transactions.length > 0) {
      throw new Error("Maquina actualmente en uso");
    }

    if (machine.relayChannel === null) {
      throw new Error("Maquina sin canal de relay asignado");
    }

    try {
      await relayManager.assertChannelReady(machine.relayChannel);
    } catch (error) {
      if (error instanceof RelayApiError && error.code === "channel_not_wired") {
        throw new Error("Esta maquina todavia no esta conectada al sistema. Usa otra maquina o avisa al encargado.");
      }
      throw error;
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
        encargoOrderId: input.encargoOrderId,
        startedAt,
        expectedEndAt,
        status: TRANSACTION_STATUS.pendingRelay
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
        throw new Error("No se puede activar maquina para un encargo entregado");
      }

      const nextStatus = ENCARGO_ORDER_STATUS.processing;
      await tx.encargoOrder.update({
        where: { id: encargoOrder.id },
        data: { status: nextStatus }
      });
    }

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

  if (transaction.machine.relayChannel === null) {
    throw new Error("Maquina sin canal de relay asignado");
  }
  await relayManager.assertChannelReady(transaction.machine.relayChannel);
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
  paymentMethod: PaymentMethodValue;
  reason?: string;
}) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, isActive: true }
  });
  if (!employee || !employee.isActive) {
    throw new Error("Empleado no valido");
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    include: {
      machine: true
    }
  });

  if (!transaction) {
    throw new Error("Transaccion no encontrada");
  }

  if (transaction.status !== TRANSACTION_STATUS.running) {
    throw new Error("Solo se puede agregar tiempo a transacciones activas");
  }

  const nextEnd = addMinutes(transaction.expectedEndAt, input.extraMinutes);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const ticketAgg = await tx.transaction.aggregate({
      _max: { ticketNumber: true }
    });
    const extensionTicketNumber = (ticketAgg._max.ticketNumber ?? 0) + 1;

    await tx.transaction.create({
      data: {
        ticketNumber: extensionTicketNumber,
        machineId: transaction.machineId,
        employeeId: input.employeeId,
        customerId: transaction.customerId,
        baseAmountCents: input.extraAmountCents,
        discountCents: 0,
        loyaltyDiscountApplied: false,
        addonDetergentQty: 0,
        addonSoftenerQty: 0,
        addonBleachQty: 0,
        addonAmountCents: 0,
        serviceType: transaction.serviceType,
        amountCents: input.extraAmountCents,
        paymentMethod: input.paymentMethod,
        isExtension: true,
        parentTransactionId: transaction.id,
        encargoOrderId: transaction.encargoOrderId,
        startedAt: now,
        expectedEndAt: now,
        status: TRANSACTION_STATUS.completed,
        endedAt: now
      }
    });

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        expectedEndAt: nextEnd
      }
    });

    await tx.transactionExtension.create({
      data: {
        transactionId: transaction.id,
        employeeId: input.employeeId,
        extraMinutes: input.extraMinutes,
        extraAmountCents: input.extraAmountCents,
        reason: input.reason
      }
    });

    return next;
  });

  timerService.scheduleExpiry(updated.id, updated.expectedEndAt);
  return updated;
}

export async function voidTransaction(input: {
  transactionId: string;
  reason: string;
  reasonCode?: string;
  reasonNotes?: string;
  employeeId: string;
  adminPin?: string;
}) {
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

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, isAdmin: true, isActive: true }
  });
  if (!employee || !employee.isActive) {
    throw new Error("Empleado no valido");
  }

  const ageMs = Date.now() - transaction.createdAt.getTime();
  const tenMinutesMs = 10 * 60_000;
  if (ageMs > tenMinutesMs && !employee.isAdmin) {
    if (!input.adminPin) {
      throw new Error("PIN admin requerido para anular transacciones de mas de 10 minutos");
    }
    const adminEmployee = await loginWithPin(input.adminPin);
    if (!adminEmployee.isAdmin) {
      throw new Error("PIN admin requerido para anular transacciones de mas de 10 minutos");
    }
  }

  if (transaction.status === TRANSACTION_STATUS.running) {
    if (transaction.machine.relayChannel === null) {
      throw new Error("Maquina sin canal de relay asignado");
    }
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        relayOffAttemptedAt: new Date()
      }
    });
    await relayManager.turnOff(transaction.machine.relayChannel);
  }
  timerService.unschedule(transaction.id);

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: TRANSACTION_STATUS.voided,
      voidReason: input.reason,
      voidReasonCode: input.reasonCode ?? null,
      voidReasonNotes: input.reasonNotes?.trim() || null,
      voidedAt: new Date(),
      voidedByEmployeeId: employee.id,
      endedAt: new Date(),
      relayTurnedOffAt: transaction.status === TRANSACTION_STATUS.running ? new Date() : transaction.relayTurnedOffAt
    }
  });

  if (transaction.status === TRANSACTION_STATUS.running) {
    await prisma.machine.update({
      where: { id: transaction.machineId },
      data: { awaitingRelease: false }
    });
  }

  await writeAuditEvent({
    type: "void_created",
    actorEmployeeId: employee.id,
    payload: {
      transactionId: transaction.id,
      ticketNumber: transaction.ticketNumber,
      amountCents: transaction.amountCents,
      reason: input.reason,
      reasonCode: input.reasonCode ?? null
    }
  });

  return updated;
}
