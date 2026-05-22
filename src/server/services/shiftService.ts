import "server-only";

import { prisma } from "@/lib/db";
import {
  CASH_MOVEMENT_TYPE,
  PAYMENT_METHODS,
  SHIFT_STATUS,
  TRANSACTION_STATUS,
  type CashMovementTypeValue
} from "@/server/domain/constants";
import {
  createCashDrop,
  getDrawerState,
  getExpectedSafeBalanceCents,
  getLastCashDrop,
  getShiftCashSnapshot
} from "@/server/services/cashDropService";
import { writeAuditEvent } from "@/server/services/auditLog";

const PAYMENT_METHOD_ORDER: Array<"cash" | "card" | "transfer"> = ["cash", "card", "transfer"];

function emptyPaymentMap() {
  return new Map<string, { paymentMethod: string; amountCents: number; count: number }>(
    PAYMENT_METHOD_ORDER.map((paymentMethod) => [paymentMethod, { paymentMethod, amountCents: 0, count: 0 }])
  );
}

export async function getActiveShift() {
  return prisma.shift.findFirst({
    where: { status: SHIFT_STATUS.open, endTime: null },
    include: {
      employee: true,
      cashMovements: {
        orderBy: { createdAt: "desc" }
      },
      cashDrops: {
        orderBy: { createdAt: "desc" },
        include: {
          performedByEmployee: {
            select: { id: true, name: true }
          }
        }
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

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, isActive: true }
  });
  if (!employee || !employee.isActive) {
    throw new Error("Empleado no valido");
  }

  const shift = await prisma.shift.create({
    data: {
      employeeId: input.employeeId,
      startingCashCents: input.startingCashCents,
      status: SHIFT_STATUS.open
    }
  });

  await writeAuditEvent({
    type: "shift_opened",
    actorEmployeeId: input.employeeId,
    payload: {
      shiftId: shift.id,
      startingCashCents: shift.startingCashCents
    }
  });

  return shift;
}

export async function addCashMovement(input: {
  employeeId: string;
  shiftId: string;
  type: CashMovementTypeValue;
  amountCents: number;
  reason: string;
}) {
  const movement = await prisma.cashMovement.create({
    data: input
  });

  await writeAuditEvent({
    type: "cash_movement",
    actorEmployeeId: input.employeeId,
    payload: {
      shiftId: input.shiftId,
      type: input.type,
      amountCents: input.amountCents,
      reason: input.reason
    }
  });

  return movement;
}

export async function calculateExpectedCashCents(shiftId: string) {
  const snapshot = await getShiftCashSnapshot(shiftId);
  return snapshot.expectedDrawerCashCents;
}

export async function closeShift(input: {
  shiftId: string;
  employeeId: string;
  actualCashCents: number;
  notes?: string;
  varianceApprovedByEmployeeId?: string;
  varianceApprovalNote?: string;
}) {
  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId }
  });
  if (!shift || shift.endTime || shift.status === SHIFT_STATUS.closed) {
    throw new Error("Turno no valido para cierre");
  }

  const [employee, config] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, isActive: true }
    }),
    prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { cashVarianceApprovalThresholdCents: true }
    })
  ]);

  if (!employee || !employee.isActive) {
    throw new Error("Empleado no valido");
  }
  if (!config) {
    throw new Error("Configuracion no disponible");
  }

  const expected = await calculateExpectedCashCents(input.shiftId);
  const difference = input.actualCashCents - expected;
  const needsApproval = Math.abs(difference) > config.cashVarianceApprovalThresholdCents;

  let varianceApproverId: string | null = null;
  if (needsApproval) {
    if (!input.varianceApprovedByEmployeeId) {
      throw new Error("Cierre requiere aprobacion de dueño por variacion de caja");
    }
    const approver = await prisma.employee.findUnique({
      where: { id: input.varianceApprovedByEmployeeId },
      select: { id: true, isAdmin: true, isActive: true }
    });
    if (!approver || !approver.isActive || !approver.isAdmin) {
      throw new Error("Aprobador invalido para cierre con variacion");
    }
    varianceApproverId = approver.id;
  }

  const closed = await prisma.shift.update({
    where: { id: input.shiftId },
    data: {
      status: SHIFT_STATUS.closed,
      endTime: new Date(),
      closedByEmployeeId: input.employeeId,
      expectedCashCents: expected,
      actualCashCents: input.actualCashCents,
      differenceCashCents: difference,
      countedCashSubmittedAt: new Date(),
      expectedCashRevealedAt: new Date(),
      varianceApprovedByEmployeeId: varianceApproverId,
      varianceApprovalNote: input.varianceApprovalNote,
      notes: input.notes
    }
  });

  await writeAuditEvent({
    type: "shift_closed",
    actorEmployeeId: input.employeeId,
    payload: {
      shiftId: input.shiftId,
      expectedCashCents: expected,
      actualCashCents: input.actualCashCents,
      differenceCashCents: difference,
      varianceApprovalRequired: needsApproval,
      varianceApprovedByEmployeeId: varianceApproverId
    }
  });

  return closed;
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
      cashDrops: {
        include: {
          performedByEmployee: {
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

  const [snapshot, drawerState, safeBalanceCents, lastCashDrop] = await Promise.all([
    getShiftCashSnapshot(shift.id),
    getDrawerState(shift.id),
    getExpectedSafeBalanceCents(),
    getLastCashDrop(shift.id)
  ]);

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

  return {
    shift,
    totals: {
      totalSalesCents,
      expectedCashCents: snapshot.expectedDrawerCashCents,
      transactionCount: nonVoidedTransactions.length,
      byPaymentMethod: Array.from(paymentMap.values()),
      cashSalesCents: paymentMap.get(PAYMENT_METHODS.cash)?.amountCents ?? 0,
      depositsCents,
      withdrawalsCents,
      cashDropsCents: snapshot.cashDropsCents,
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
    })),
    cashDrops: shift.cashDrops.map((drop) => ({
      id: drop.id,
      amountCents: drop.amountCents,
      destination: drop.destination,
      reason: drop.reason,
      notes: drop.notes,
      overrideUsed: drop.overrideUsed,
      createdAt: drop.createdAt.toISOString(),
      employeeName: drop.performedByEmployee.name
    })),
    drawerControl: {
      currentCashCents: drawerState.currentCashCents,
      capCents: drawerState.capCents,
      softWarningCents: drawerState.softWarningCents,
      residualCents: drawerState.residualCents,
      needsWarning: drawerState.needsWarning,
      blockedAtCap: drawerState.blockedAtCap,
      recommendedDropCents: drawerState.recommendedDropCents
    },
    safeLedger: {
      expectedBalanceCents: safeBalanceCents,
      lastDropAt: lastCashDrop?.createdAt.toISOString() ?? null,
      lastDropAmountCents: lastCashDrop?.amountCents ?? null
    }
  };
}

export async function registerCashDrop(input: {
  shiftId: string;
  employeeId: string;
  amountCents?: number;
  destination?: string;
  reason?: string;
  notes?: string;
  overrideUsed?: boolean;
  approvedByEmployeeId?: string;
}) {
  return createCashDrop({
    shiftId: input.shiftId,
    performedByEmployeeId: input.employeeId,
    amountCents: input.amountCents,
    destination: input.destination,
    reason: input.reason,
    notes: input.notes,
    overrideUsed: input.overrideUsed,
    approvedByEmployeeId: input.approvedByEmployeeId
  });
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

  const result: Array<
    typeof shifts[number] & {
      totals: {
        totalSalesCents: number;
        transactionCount: number;
        byPaymentMethod: Array<{ paymentMethod: string; amountCents: number; count: number }>;
        voidedCount: number;
        voidedTotalCents: number;
        depositsCents: number;
        withdrawalsCents: number;
        cashDropsCents: number;
      };
    }
  > = [];

  for (const shift of shifts) {
    const summary = await getShiftSummary(shift.id);
    result.push({
      ...shift,
      totals: {
        totalSalesCents: summary.totals.totalSalesCents,
        transactionCount: summary.totals.transactionCount,
        byPaymentMethod: summary.totals.byPaymentMethod,
        voidedCount: summary.totals.voidedCount,
        voidedTotalCents: summary.totals.voidedTotalCents,
        depositsCents: summary.totals.depositsCents,
        withdrawalsCents: summary.totals.withdrawalsCents,
        cashDropsCents: summary.totals.cashDropsCents
      }
    });
  }

  return result;
}
