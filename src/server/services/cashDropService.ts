import "server-only";

import { prisma } from "@/lib/db";
import {
  CASH_DROP_DESTINATION,
  CASH_DROP_REASON,
  CASH_MOVEMENT_TYPE,
  PAYMENT_METHODS,
  TRANSACTION_STATUS
} from "@/server/domain/constants";
import { writeAuditEvent } from "@/server/services/auditLog";

export type ShiftCashSnapshot = {
  shiftId: string;
  startTime: Date;
  endTime: Date;
  startingCashCents: number;
  cashSalesCents: number;
  depositsCents: number;
  withdrawalsCents: number;
  cashDropsCents: number;
  expectedDrawerCashCents: number;
};

export async function getShiftCashSnapshot(shiftId: string): Promise<ShiftCashSnapshot> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      startingCashCents: true
    }
  });

  if (!shift) {
    throw new Error("Turno no encontrado");
  }

  const rangeStart = shift.startTime;
  const rangeEnd = shift.endTime ?? new Date();

  const cashSales = await prisma.transaction.aggregate({
    _sum: { amountCents: true },
    where: {
      createdAt: {
        gte: rangeStart,
        lte: rangeEnd
      },
      paymentMethod: PAYMENT_METHODS.cash,
      status: {
        not: TRANSACTION_STATUS.voided
      }
    }
  });

  const movements = await prisma.cashMovement.groupBy({
    by: ["type"],
    _sum: { amountCents: true },
    where: {
      shiftId
    }
  });

  const dropsAgg = await prisma.cashDrop.aggregate({
    _sum: { amountCents: true },
    where: {
      shiftId
    }
  });

  const depositsCents = movements.find((item) => item.type === CASH_MOVEMENT_TYPE.deposit)?._sum.amountCents ?? 0;
  const withdrawalsCents = movements.find((item) => item.type === CASH_MOVEMENT_TYPE.withdrawal)?._sum.amountCents ?? 0;
  const cashSalesCents = cashSales._sum.amountCents ?? 0;
  const cashDropsCents = dropsAgg._sum.amountCents ?? 0;

  return {
    shiftId: shift.id,
    startTime: rangeStart,
    endTime: rangeEnd,
    startingCashCents: shift.startingCashCents,
    cashSalesCents,
    depositsCents,
    withdrawalsCents,
    cashDropsCents,
    expectedDrawerCashCents: shift.startingCashCents + cashSalesCents + depositsCents - withdrawalsCents - cashDropsCents
  };
}

export async function getExpectedSafeBalanceCents() {
  const aggregate = await prisma.safeLedgerEvent.aggregate({
    _sum: { amountDeltaCents: true }
  });
  return aggregate._sum.amountDeltaCents ?? 0;
}

export async function getDrawerPolicy() {
  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: {
      cashDrawerCapCents: true,
      cashDrawerSoftWarningPct: true,
      cashDropResidualCents: true
    }
  });

  if (!config) {
    throw new Error("Configuracion no disponible");
  }

  return {
    capCents: config.cashDrawerCapCents,
    softWarningPct: config.cashDrawerSoftWarningPct,
    residualCents: config.cashDropResidualCents,
    softWarningCents: Math.floor((config.cashDrawerCapCents * config.cashDrawerSoftWarningPct) / 100)
  };
}

export async function getDrawerState(shiftId: string) {
  const [snapshot, policy] = await Promise.all([getShiftCashSnapshot(shiftId), getDrawerPolicy()]);
  const currentCashCents = snapshot.expectedDrawerCashCents;
  return {
    currentCashCents,
    capCents: policy.capCents,
    softWarningCents: policy.softWarningCents,
    residualCents: policy.residualCents,
    needsWarning: currentCashCents >= policy.softWarningCents,
    blockedAtCap: currentCashCents >= policy.capCents,
    recommendedDropCents: Math.max(0, currentCashCents - policy.residualCents)
  };
}

export async function createCashDrop(input: {
  shiftId: string;
  performedByEmployeeId: string;
  amountCents?: number;
  destination?: string;
  reason?: string;
  notes?: string;
  overrideUsed?: boolean;
  approvedByEmployeeId?: string;
  deviceId?: string;
}) {
  const [employee, shift, drawerState, safeBalance] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: input.performedByEmployeeId },
      select: { id: true, isActive: true }
    }),
    prisma.shift.findUnique({
      where: { id: input.shiftId },
      select: { id: true, endTime: true }
    }),
    getDrawerState(input.shiftId),
    getExpectedSafeBalanceCents()
  ]);

  if (!employee || !employee.isActive) {
    throw new Error("Empleado no valido");
  }
  if (!shift || shift.endTime) {
    throw new Error("Turno no valido para drop");
  }

  const dropAmountCents = input.amountCents ?? drawerState.recommendedDropCents;
  if (!Number.isFinite(dropAmountCents) || dropAmountCents <= 0) {
    throw new Error("Monto de drop invalido");
  }
  if (dropAmountCents > drawerState.currentCashCents) {
    throw new Error("No hay suficiente efectivo en caja para ese drop");
  }

  const destination = input.destination ?? CASH_DROP_DESTINATION.safe;
  const reason = input.reason ?? (drawerState.blockedAtCap ? CASH_DROP_REASON.threshold : CASH_DROP_REASON.manual);
  const overrideUsed = input.overrideUsed ?? false;

  const result = await prisma.$transaction(async (tx) => {
    const drop = await tx.cashDrop.create({
      data: {
        shiftId: input.shiftId,
        performedByEmployeeId: input.performedByEmployeeId,
        approvedByEmployeeId: input.approvedByEmployeeId ?? null,
        amountCents: Math.round(dropAmountCents),
        destination,
        reason,
        notes: input.notes?.trim() || null,
        deviceId: input.deviceId ?? null,
        overrideUsed
      }
    });

    const nextSafeBalance = safeBalance + drop.amountCents;
    const safeEvent = await tx.safeLedgerEvent.create({
      data: {
        shiftId: input.shiftId,
        cashDropId: drop.id,
        performedByEmployeeId: input.performedByEmployeeId,
        type: "cash_drop",
        amountDeltaCents: drop.amountCents,
        expectedBalanceAfterCents: nextSafeBalance,
        notes: input.notes?.trim() || null
      }
    });

    return { drop, safeEvent };
  });

  await writeAuditEvent({
    type: "cash_drop",
    actorEmployeeId: input.performedByEmployeeId,
    deviceId: input.deviceId,
    payload: {
      shiftId: input.shiftId,
      amountCents: result.drop.amountCents,
      destination: result.drop.destination,
      reason: result.drop.reason,
      overrideUsed: result.drop.overrideUsed,
      approvedByEmployeeId: result.drop.approvedByEmployeeId
    }
  });

  return result;
}

export async function getLastCashDrop(shiftId: string) {
  return prisma.cashDrop.findFirst({
    where: { shiftId },
    orderBy: { createdAt: "desc" }
  });
}
