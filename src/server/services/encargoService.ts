import "server-only";

import { prisma } from "@/lib/db";
import {
  ENCARGO_ORDER_STATUS,
  ENCARGO_PAYMENT_MODE,
  ENCARGO_PAYMENT_STATUS,
  PAYMENT_METHODS,
  TRANSACTION_STATUS,
  type EncargoOrderStatusValue,
  type PaymentMethodValue
} from "@/server/domain/constants";

const ACTIVE_ENCARGO_STATUSES: EncargoOrderStatusValue[] = [
  ENCARGO_ORDER_STATUS.order,
  ENCARGO_ORDER_STATUS.processing,
  ENCARGO_ORDER_STATUS.ready
];

export async function createEncargoOrder(input: {
  employeeId: string;
  customerId: string;
  weightKg: number;
  loads: number;
  notes?: string;
  paymentMode: "now" | "pickup";
  paymentMethod?: PaymentMethodValue;
}) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, isActive: true }
  });

  if (!employee || !employee.isActive) {
    throw new Error("Empleado no valido");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, isActive: true, firstName: true, lastName: true, phone: true }
  });
  if (!customer || !customer.isActive) {
    throw new Error("Cliente no valido");
  }

  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: { encargoPricePerKgCents: true, encargoMinimumChargeCents: true }
  });
  if (!config) {
    throw new Error("Configuracion no disponible");
  }

  const rawPrice = Math.round(input.weightKg * config.encargoPricePerKgCents);
  const priceCents = Math.max(rawPrice, config.encargoMinimumChargeCents);

  return prisma.encargoOrder.create({
    data: {
      customerId: customer.id,
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      customerPhone: customer.phone,
      weightKg: input.weightKg,
      loads: input.loads,
      notes: input.notes?.trim() || null,
      priceCents,
      paymentMode: input.paymentMode === "now" ? ENCARGO_PAYMENT_MODE.now : ENCARGO_PAYMENT_MODE.pickup,
      paymentStatus: input.paymentMode === "now" ? ENCARGO_PAYMENT_STATUS.paid : ENCARGO_PAYMENT_STATUS.pending,
      paymentMethod:
        input.paymentMode === "now"
          ? input.paymentMethod === PAYMENT_METHODS.card
            ? PAYMENT_METHODS.card
            : input.paymentMethod === PAYMENT_METHODS.transfer
              ? PAYMENT_METHODS.transfer
              : PAYMENT_METHODS.cash
          : null,
      status: ENCARGO_ORDER_STATUS.order,
      createdByEmployeeId: employee.id
    }
  });
}

export async function listEncargoOrders(input?: { includeDelivered?: boolean }) {
  const includeDelivered = input?.includeDelivered ?? false;
  const now = Date.now();

  const orders = await prisma.encargoOrder.findMany({
    where: includeDelivered
      ? undefined
      : {
          status: {
            in: ACTIVE_ENCARGO_STATUSES
          }
        },
    orderBy: [{ status: "asc" }, { receivedAt: "asc" }],
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, phone: true }
      },
      createdByEmployee: {
        select: { id: true, name: true }
      },
      transactions: {
        where: {
          status: {
            in: [TRANSACTION_STATUS.running, TRANSACTION_STATUS.pendingRelay]
          }
        },
        include: {
          machine: {
            select: { id: true, name: true, type: true }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  return orders.map((order) => {
    const elapsedMinutes = Math.max(0, Math.floor((now - order.receivedAt.getTime()) / 60_000));
    const readySince = order.readyAt ?? (order.status === ENCARGO_ORDER_STATUS.ready ? order.updatedAt : null);
    const readyForHours = readySince ? Math.max(0, Math.floor((now - readySince.getTime()) / 3_600_000)) : 0;

    return {
      id: order.id,
      customerId: order.customerId,
      customer: order.customer
        ? {
            id: order.customer.id,
            firstName: order.customer.firstName,
            lastName: order.customer.lastName,
            phone: order.customer.phone
          }
        : null,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      weightKg: order.weightKg,
      loads: order.loads,
      notes: order.notes,
      priceCents: order.priceCents,
      paymentMode: order.paymentMode,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      status: order.status,
      receivedAt: order.receivedAt.toISOString(),
      readyAt: order.readyAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      createdByEmployee: order.createdByEmployee,
      elapsedMinutes,
      readyForHours,
      activeMachines: order.transactions.map((tx) => ({
        transactionId: tx.id,
        machineId: tx.machine.id,
        machineName: tx.machine.name,
        machineType: tx.machine.type === "dryer" ? "dryer" : "washer",
        startedAt: tx.startedAt.toISOString(),
        expectedEndAt: tx.expectedEndAt.toISOString(),
        status: tx.status
      }))
    };
  });
}

export async function setEncargoOrderStatus(input: {
  orderId: string;
  status: EncargoOrderStatusValue;
  paymentMethod?: PaymentMethodValue;
}) {
  const order = await prisma.encargoOrder.findUnique({
    where: { id: input.orderId }
  });
  if (!order) {
    throw new Error("Encargo no encontrado");
  }

  if (order.status === ENCARGO_ORDER_STATUS.pickedUp) {
    throw new Error("El encargo ya fue entregado");
  }

  const updates: {
    status: EncargoOrderStatusValue;
    readyAt?: Date | null;
    deliveredAt?: Date | null;
    paymentStatus?: string;
    paymentMethod?: string | null;
  } = {
    status: input.status
  };

  if (input.status === ENCARGO_ORDER_STATUS.ready) {
    updates.readyAt = new Date();
  }

  if (input.status === ENCARGO_ORDER_STATUS.pickedUp) {
    updates.deliveredAt = new Date();
    updates.paymentStatus = ENCARGO_PAYMENT_STATUS.paid;

    if (order.paymentMode === ENCARGO_PAYMENT_MODE.pickup) {
      if (!input.paymentMethod) {
        throw new Error("Metodo de pago requerido para entregar encargo pendiente");
      }
      updates.paymentMethod = input.paymentMethod;
    } else if (order.paymentMethod) {
      updates.paymentMethod = order.paymentMethod;
    }
  }

  return prisma.encargoOrder.update({
    where: { id: order.id },
    data: updates
  });
}

export async function setEncargoOrderMachineStage(input: { orderId: string; machineType: "washer" | "dryer" }) {
  const order = await prisma.encargoOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true }
  });

  if (!order) {
    throw new Error("Encargo no encontrado");
  }
  if (order.status === ENCARGO_ORDER_STATUS.pickedUp) {
    throw new Error("El encargo ya fue entregado");
  }

  await prisma.encargoOrder.update({
    where: { id: order.id },
    data: { status: ENCARGO_ORDER_STATUS.processing }
  });
}

export async function getEncargoOrderById(orderId: string) {
  return prisma.encargoOrder.findUnique({
    where: { id: orderId }
  });
}
