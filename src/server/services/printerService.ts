import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { printerManager } from "@/server/printer/printerManager";
import { buildTicketDocuments, type TicketContext } from "@/server/services/ticketTemplates";

type PrintJobStatusFilter = "all" | "pending" | "printed" | "failed";

type PrintJobCursor = {
  createdAt: string;
  id: string;
};

export type ListPrintJobsFilters = {
  from?: Date;
  to?: Date;
  status?: PrintJobStatusFilter;
  workOrderNumber?: number;
  limit?: number;
  cursor?: string;
};

export type RetryFailedPrintJobsFilters = {
  from?: Date;
  to?: Date;
  workOrderNumber?: number;
};

function normalizeTicketType(ticketType: string): "master_customer" | "master_store" | "load_tag" {
  const normalized = ticketType.trim().toLowerCase();
  if (normalized === "master_store" || normalized === "master_customer" || normalized === "load_tag") {
    return normalized;
  }
  if (normalized.includes("store")) {
    return "master_store";
  }
  if (normalized.includes("customer") || normalized.includes("cliente")) {
    return "master_customer";
  }
  return "load_tag";
}

function parseTicketPayload(payloadJson: string, ticketType: string) {
  const fallback = {
    title: `Ticket ${normalizeTicketType(ticketType)}`,
    text: "No fue posible leer contenido del ticket."
  };

  try {
    const parsed = JSON.parse(payloadJson) as { title?: unknown; text?: unknown };
    const title = typeof parsed.title === "string" && parsed.title.trim().length > 0 ? parsed.title.trim() : fallback.title;
    const text = typeof parsed.text === "string" && parsed.text.trim().length > 0 ? parsed.text : fallback.text;
    return { title, text };
  } catch {
    return fallback;
  }
}

function encodeCursor(cursor: PrintJobCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as PrintJobCursor;
    const createdAt = new Date(payload.createdAt);
    if (!payload.id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Cursor invalido");
    }
    return { createdAt, id: payload.id };
  } catch {
    throw new Error("Cursor invalido");
  }
}

export async function queueAndPrintWorkOrderTickets(context: TicketContext) {
  const docs = buildTicketDocuments(context);

  const jobs = await prisma.$transaction(
    docs.map((doc) =>
      prisma.printJob.create({
        data: {
          workOrderId: context.workOrderId,
          ticketType: doc.ticketType,
          loadIndex: doc.loadIndex ?? null,
          status: "pending",
          payloadJson: JSON.stringify({
            title: doc.title,
            text: doc.text,
            ticketType: doc.ticketType,
            loadIndex: doc.loadIndex ?? null
          })
        }
      })
    )
  );

  const failedJobs: Array<{ id: string; error: string }> = [];

  for (const [index, job] of jobs.entries()) {
    const doc = docs[index];
    try {
      const result = await printerManager.print({
        ticketType: doc.ticketType,
        title: doc.title,
        text: doc.text,
        meta: {
          workOrderId: context.workOrderId,
          orderNumber: context.orderNumber,
          loadIndex: doc.loadIndex ?? null
        }
      });

      if (result.skipped) {
        await prisma.printJob.update({
          where: { id: job.id },
          data: {
            status: "pending",
            attemptCount: 0,
            lastError: "auto_print_disabled"
          }
        });
        continue;
      }

      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "printed",
          attemptCount: { increment: 1 },
          printedAt: new Date(),
          lastError: null
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedJobs.push({ id: job.id, error: message });
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          attemptCount: { increment: 1 },
          lastError: message
        }
      });
      logger.error("Ticket print failed", {
        jobId: job.id,
        workOrderId: context.workOrderId,
        ticketType: doc.ticketType,
        error: message
      });
    }
  }

  return {
    queuedJobs: jobs.length,
    failedJobs
  };
}

export async function retryPrintJob(jobId: string) {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error("Print job no encontrado");
  }

  const payload = JSON.parse(job.payloadJson) as {
    title: string;
    text: string;
    ticketType: string;
    loadIndex?: number | null;
  };

  try {
    const result = await printerManager.print({
      ticketType: payload.ticketType,
      title: payload.title,
      text: payload.text,
      meta: {
        workOrderId: job.workOrderId,
        loadIndex: payload.loadIndex ?? null
      }
    });

    if (result.skipped) {
      return prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "pending",
          lastError: "auto_print_disabled"
        }
      });
    }

    return prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "printed",
        attemptCount: { increment: 1 },
        printedAt: new Date(),
        lastError: null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        attemptCount: { increment: 1 },
        lastError: message
      }
    });
    throw error;
  }
}

export async function listPrintJobs(filters: ListPrintJobsFilters) {
  const status = filters.status && filters.status !== "all" ? filters.status : undefined;
  const limit = Math.max(1, Math.min(200, Math.floor(filters.limit ?? 50)));
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  const where = {
    createdAt: {
      gte: filters.from,
      lte: filters.to
    },
    status,
    ...(typeof filters.workOrderNumber === "number" ? { workOrder: { orderNumber: filters.workOrderNumber } } : {}),
    ...(cursor
      ? {
          OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }]
        }
      : {})
  };

  const rows = await prisma.printJob.findMany({
    where,
    include: {
      workOrder: {
        select: {
          id: true,
          orderNumber: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextRow = hasMore ? pageRows[pageRows.length - 1] : null;

  return {
    items: pageRows.map((job) => {
      const preview = parseTicketPayload(job.payloadJson, job.ticketType);
      return {
        id: job.id,
        workOrderId: job.workOrderId,
        workOrderNumber: job.workOrder.orderNumber,
        ticketType: normalizeTicketType(job.ticketType),
        loadIndex: job.loadIndex,
        status: job.status,
        attemptCount: job.attemptCount,
        lastError: job.lastError,
        printedAt: job.printedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        ticketPreview: preview
      };
    }),
    hasMore,
    nextCursor: nextRow
      ? encodeCursor({
          createdAt: nextRow.createdAt.toISOString(),
          id: nextRow.id
        })
      : null
  };
}

export async function retryFailedPrintJobs(filters: RetryFailedPrintJobsFilters) {
  const failedJobs = await prisma.printJob.findMany({
    where: {
      status: "failed",
      createdAt: {
        gte: filters.from,
        lte: filters.to
      },
      ...(typeof filters.workOrderNumber === "number" ? { workOrder: { orderNumber: filters.workOrderNumber } } : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true
    }
  });

  let retriedOk = 0;
  let retriedFailed = 0;
  const failedIds: string[] = [];

  for (const job of failedJobs) {
    try {
      await retryPrintJob(job.id);
      retriedOk += 1;
    } catch (error) {
      retriedFailed += 1;
      failedIds.push(job.id);
      logger.error("Bulk retry print failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    retriedOk,
    retriedFailed,
    failedIds
  };
}
