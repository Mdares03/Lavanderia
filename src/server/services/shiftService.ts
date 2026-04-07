import "server-only";

import { prisma } from "@/lib/db";
import { CASH_MOVEMENT_TYPE, PAYMENT_METHODS, TRANSACTION_STATUS, type CashMovementTypeValue } from "@/server/domain/constants";
import { calculateExpectedCash } from "@/server/services/calculations";

export async function getActiveShift() {
  return prisma.shift.findFirst({
    where: { endTime: null },
    include: {
      employee: true,
      cashMovements: {
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { startTime: "desc" }
  });
}

export async function openShift(input: { employeeId: string; startingCashCents: number }) {
  const existing = await getActiveShift();
  if (existing) {
    throw new Error("Ya hay un turno abierto");
  }
  return prisma.shift.create({
    data: {
      employeeId: input.employeeId,
      startingCashCents: input.startingCashCents
    }
  });
}

export async function addCashMovement(input: {
  employeeId: string;
  shiftId: string;
  type: CashMovementTypeValue;
  amountCents: number;
  reason: string;
}) {
  return prisma.cashMovement.create({
    data: input
  });
}

export async function calculateExpectedCashCents(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId }
  });
  if (!shift) {
    throw new Error("Turno no encontrado");
  }

  const rangeEnd = shift.endTime ?? new Date();
  const rangeStart = shift.startTime;

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

  const deposits = movements.find((item) => item.type === CASH_MOVEMENT_TYPE.deposit)?._sum.amountCents ?? 0;
  const withdrawals = movements.find((item) => item.type === CASH_MOVEMENT_TYPE.withdrawal)?._sum.amountCents ?? 0;
  const sales = cashSales._sum.amountCents ?? 0;

  return calculateExpectedCash({
    startingCashCents: shift.startingCashCents,
    cashSalesCents: sales,
    depositsCents: deposits,
    withdrawalsCents: withdrawals
  });
}

export async function closeShift(input: { shiftId: string; actualCashCents: number; notes?: string }) {
  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId }
  });
  if (!shift || shift.endTime) {
    throw new Error("Turno no valido para cierre");
  }
  const expected = await calculateExpectedCashCents(input.shiftId);
  const difference = input.actualCashCents - expected;

  return prisma.shift.update({
    where: { id: input.shiftId },
    data: {
      endTime: new Date(),
      expectedCashCents: expected,
      actualCashCents: input.actualCashCents,
      differenceCashCents: difference,
      notes: input.notes
    }
  });
}

export async function getShiftSummary(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      cashMovements: true,
      employee: true
    }
  });
  if (!shift) {
    throw new Error("Turno no encontrado");
  }

  const end = shift.endTime ?? new Date();
  const txStats = await prisma.transaction.groupBy({
    by: ["paymentMethod"],
    where: {
      createdAt: {
        gte: shift.startTime,
        lte: end
      },
      status: {
        not: TRANSACTION_STATUS.voided
      }
    },
    _sum: { amountCents: true },
    _count: { _all: true }
  });

  const totalSalesCents = txStats.reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0);
  const expectedCashCents = await calculateExpectedCashCents(shift.id);

  return {
    shift,
    totals: {
      totalSalesCents,
      expectedCashCents,
      transactionCount: txStats.reduce((sum, row) => sum + row._count._all, 0),
      byPaymentMethod: txStats.map((row) => ({
        paymentMethod: row.paymentMethod,
        amountCents: row._sum.amountCents ?? 0,
        count: row._count._all
      }))
    }
  };
}

export async function getShiftHistory(range: { from: Date; to: Date }) {
  return prisma.shift.findMany({
    where: {
      startTime: {
        gte: range.from,
        lte: range.to
      }
    },
    include: {
      employee: true
    },
    orderBy: { startTime: "desc" }
  });
}
