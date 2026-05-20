import "server-only";

import { prisma } from "@/lib/db";
import { CASH_MOVEMENT_TYPE, PAYMENT_METHODS, TRANSACTION_STATUS, type CashMovementTypeValue } from "@/server/domain/constants";
import { calculateExpectedCash } from "@/server/services/calculations";

const PAYMENT_METHOD_ORDER: Array<"cash" | "card" | "transfer"> = ["cash", "card", "transfer"];

function emptyPaymentMap() {
  return new Map<string, { paymentMethod: string; amountCents: number; count: number }>(
    PAYMENT_METHOD_ORDER.map((paymentMethod) => [paymentMethod, { paymentMethod, amountCents: 0, count: 0 }])
  );
}

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
      cashMovements: {
        include: {
          employee: {
            select: { id: true, name: true }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      employee: true
    }
  });
  if (!shift) {
    throw new Error("Turno no encontrado");
  }

  const end = shift.endTime ?? new Date();
  const nonVoidedTransactions = await prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: shift.startTime,
        lte: end
      },
      status: {
        not: TRANSACTION_STATUS.voided
      }
    },
    select: {
      id: true,
      amountCents: true,
      paymentMethod: true
    }
  });

  const voidedTransactions = await prisma.transaction.findMany({
    where: {
      status: TRANSACTION_STATUS.voided,
      voidedAt: {
        gte: shift.startTime,
        lte: end
      }
    },
    include: {
      machine: {
        select: { name: true }
      },
      voidedByEmployee: {
        select: { id: true, name: true }
      }
    },
    orderBy: {
      voidedAt: "desc"
    }
  });

  const paymentMap = emptyPaymentMap();
  let totalSalesCents = 0;
  for (const tx of nonVoidedTransactions) {
    const entry = paymentMap.get(tx.paymentMethod) ?? { paymentMethod: tx.paymentMethod, amountCents: 0, count: 0 };
    entry.amountCents += tx.amountCents;
    entry.count += 1;
    paymentMap.set(tx.paymentMethod, entry);
    totalSalesCents += tx.amountCents;
  }

  const depositsCents = shift.cashMovements
    .filter((row) => row.type === CASH_MOVEMENT_TYPE.deposit)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const withdrawalsCents = shift.cashMovements
    .filter((row) => row.type === CASH_MOVEMENT_TYPE.withdrawal)
    .reduce((sum, row) => sum + row.amountCents, 0);

  const voidedTotalCents = voidedTransactions.reduce((sum, row) => sum + row.amountCents, 0);
  const voidedByEmployeeMap = new Map<string, { employeeId: string; employeeName: string; count: number; amountCents: number }>();
  for (const tx of voidedTransactions) {
    const key = tx.voidedByEmployee?.id ?? "unknown";
    const current = voidedByEmployeeMap.get(key) ?? {
      employeeId: tx.voidedByEmployee?.id ?? "unknown",
      employeeName: tx.voidedByEmployee?.name ?? "Sin asignar",
      count: 0,
      amountCents: 0
    };
    current.count += 1;
    current.amountCents += tx.amountCents;
    voidedByEmployeeMap.set(key, current);
  }

  const expectedCashCents = await calculateExpectedCashCents(shift.id);

  return {
    shift,
    totals: {
      totalSalesCents,
      expectedCashCents,
      transactionCount: nonVoidedTransactions.length,
      byPaymentMethod: Array.from(paymentMap.values()),
      cashSalesCents: paymentMap.get(PAYMENT_METHODS.cash)?.amountCents ?? 0,
      depositsCents,
      withdrawalsCents,
      voidedCount: voidedTransactions.length,
      voidedTotalCents,
      voidedByEmployee: Array.from(voidedByEmployeeMap.values()).sort((a, b) => b.count - a.count)
    },
    voidedTransactions: voidedTransactions.map((tx) => ({
      id: tx.id,
      ticketNumber: tx.ticketNumber,
      machineName: tx.machine.name,
      amountCents: tx.amountCents,
      reason: tx.voidReason,
      voidedAt: tx.voidedAt?.toISOString() ?? tx.updatedAt.toISOString(),
      employeeName: tx.voidedByEmployee?.name ?? "Sin asignar"
    })),
    cashMovements: shift.cashMovements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amountCents: movement.amountCents,
      reason: movement.reason,
      createdAt: movement.createdAt.toISOString(),
      employeeName: movement.employee.name
    }))
  };
}

export async function getShiftHistory(range: { from: Date; to: Date }) {
  const shifts = await prisma.shift.findMany({
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

  return Promise.all(
    shifts.map(async (shift) => {
      const end = shift.endTime ?? new Date();

      const transactions = await prisma.transaction.findMany({
        where: {
          createdAt: {
            gte: shift.startTime,
            lte: end
          },
          status: {
            not: TRANSACTION_STATUS.voided
          }
        },
        select: {
          amountCents: true,
          paymentMethod: true
        }
      });

      const paymentMap = emptyPaymentMap();
      let totalSalesCents = 0;
      for (const tx of transactions) {
        const entry = paymentMap.get(tx.paymentMethod) ?? { paymentMethod: tx.paymentMethod, amountCents: 0, count: 0 };
        entry.amountCents += tx.amountCents;
        entry.count += 1;
        paymentMap.set(tx.paymentMethod, entry);
        totalSalesCents += tx.amountCents;
      }

      const voided = await prisma.transaction.aggregate({
        _sum: { amountCents: true },
        _count: { _all: true },
        where: {
          status: TRANSACTION_STATUS.voided,
          voidedAt: {
            gte: shift.startTime,
            lte: end
          }
        }
      });

      const movementTotals = await prisma.cashMovement.groupBy({
        by: ["type"],
        _sum: { amountCents: true },
        where: {
          shiftId: shift.id
        }
      });
      const depositsCents = movementTotals.find((row) => row.type === CASH_MOVEMENT_TYPE.deposit)?._sum.amountCents ?? 0;
      const withdrawalsCents = movementTotals.find((row) => row.type === CASH_MOVEMENT_TYPE.withdrawal)?._sum.amountCents ?? 0;

      return {
        ...shift,
        totals: {
          totalSalesCents,
          transactionCount: transactions.length,
          byPaymentMethod: Array.from(paymentMap.values()),
          voidedCount: voided._count._all,
          voidedTotalCents: voided._sum.amountCents ?? 0,
          depositsCents,
          withdrawalsCents
        }
      };
    })
  );
}
