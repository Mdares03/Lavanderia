import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { TRANSACTION_STATUS } from "@/server/domain/constants";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

const LOYALTY_ELIGIBLE_STATUSES = [TRANSACTION_STATUS.pendingRelay, TRANSACTION_STATUS.running, TRANSACTION_STATUS.completed] as const;

export type CustomerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  eligibleTransactionCount: number;
  totalSpentCents: number;
  nextDiscountTransactionNumber: number;
  isNextTransactionDiscount: boolean;
};

export function normalizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}

function sanitizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit) || !limit) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function nextDiscountTransactionNumber(transactionCount: number, everyN: number) {
  const normalizedEveryN = Math.max(1, everyN);
  return Math.ceil((transactionCount + 1) / normalizedEveryN) * normalizedEveryN;
}

export async function listCustomers(input: { query?: string; limit?: number }) {
  const limit = sanitizeLimit(input.limit);
  const query = input.query?.trim();

  const where: Prisma.CustomerWhereInput = query
    ? {
        isActive: true,
        OR: [
          { firstName: { contains: query } },
          { lastName: { contains: query } },
          { phone: { contains: query } },
          { email: { contains: query } }
        ]
      }
    : { isActive: true };

  const [customers, config] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit
    }),
    prisma.appConfig.findUnique({
      where: { id: 1 },
      select: {
        loyaltyEveryNTransactions: true,
        loyaltyDiscountPct: true
      }
    })
  ]);

  const customerIds = customers.map((customer) => customer.id);
  const stats =
    customerIds.length > 0
      ? await prisma.transaction.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            status: { in: [...LOYALTY_ELIGIBLE_STATUSES] }
          },
          _count: { _all: true },
          _sum: { amountCents: true }
        })
      : [];

  const statsMap = new Map<string, { count: number; total: number }>();
  for (const row of stats) {
    statsMap.set(row.customerId, {
      count: row._count._all,
      total: row._sum.amountCents ?? 0
    });
  }

  const loyaltyEveryNTransactions = Math.max(1, config?.loyaltyEveryNTransactions ?? 10);
  const loyaltyDiscountPct = Math.max(0, Math.min(100, config?.loyaltyDiscountPct ?? 50));

  const rows: CustomerListItem[] = customers.map((customer) => {
    const txStats = statsMap.get(customer.id) ?? { count: 0, total: 0 };
    const nextDiscount = nextDiscountTransactionNumber(txStats.count, loyaltyEveryNTransactions);

    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      eligibleTransactionCount: txStats.count,
      totalSpentCents: txStats.total,
      nextDiscountTransactionNumber: nextDiscount,
      isNextTransactionDiscount: txStats.count + 1 === nextDiscount
    };
  });

  return {
    customers: rows,
    loyalty: {
      everyNTransactions: loyaltyEveryNTransactions,
      discountPct: loyaltyDiscountPct
    }
  };
}

export async function createCustomer(input: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
}) {
  const normalizedPhone = normalizePhone(input.phone);
  if (normalizedPhone.length < 8) {
    throw new Error("Telefono invalido");
  }

  try {
    return await prisma.customer.create({
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: normalizedPhone,
        email: input.email?.trim() || null
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Ya existe un cliente con ese telefono");
    }
    throw error;
  }
}
