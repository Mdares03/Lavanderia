import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  printJob: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  },
  $transaction: vi.fn()
}));

const printerManagerMock = vi.hoisted(() => ({
  print: vi.fn()
}));

const loggerMock = vi.hoisted(() => ({
  error: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock
}));

vi.mock("@/server/printer/printerManager", () => ({
  printerManager: printerManagerMock
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock
}));

import { listPrintJobs, retryFailedPrintJobs } from "@/server/services/printerService";

describe("printerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists print jobs with filters, cursor pagination and safe payload parsing", async () => {
    prismaMock.printJob.findMany.mockResolvedValue([
      {
        id: "job-3",
        workOrderId: "wo-3",
        ticketType: "MASTER_CUSTOMER",
        loadIndex: null,
        status: "failed",
        payloadJson: JSON.stringify({ title: "Orden 103", text: "Ticket cliente" }),
        attemptCount: 2,
        lastError: "offline",
        printedAt: null,
        createdAt: new Date("2026-05-22T10:03:00.000Z"),
        workOrder: { id: "wo-3", orderNumber: 103 }
      },
      {
        id: "job-2",
        workOrderId: "wo-2",
        ticketType: "weird_type",
        loadIndex: 1,
        status: "failed",
        payloadJson: "{bad-json",
        attemptCount: 1,
        lastError: "timeout",
        printedAt: null,
        createdAt: new Date("2026-05-22T10:02:00.000Z"),
        workOrder: { id: "wo-2", orderNumber: 103 }
      },
      {
        id: "job-1",
        workOrderId: "wo-1",
        ticketType: "load_tag",
        loadIndex: 2,
        status: "failed",
        payloadJson: JSON.stringify({ title: "extra", text: "extra" }),
        attemptCount: 1,
        lastError: null,
        printedAt: null,
        createdAt: new Date("2026-05-22T10:01:00.000Z"),
        workOrder: { id: "wo-1", orderNumber: 103 }
      }
    ]);

    const result = await listPrintJobs({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-22T23:59:59.000Z"),
      status: "failed",
      workOrderNumber: 103,
      limit: 2
    });

    expect(prismaMock.printJob.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.printJob.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        status: "failed",
        workOrder: { orderNumber: 103 }
      },
      take: 3
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "job-3",
      ticketType: "master_customer",
      ticketPreview: { title: "Orden 103", text: "Ticket cliente" }
    });
    expect(result.items[1]).toMatchObject({
      id: "job-2",
      ticketType: "load_tag",
      ticketPreview: {
        title: "Ticket load_tag",
        text: "No fue posible leer contenido del ticket."
      }
    });
    expect(result.hasMore).toBe(true);
    expect(typeof result.nextCursor).toBe("string");
  });

  it("retries only failed jobs and reports partial failures", async () => {
    prismaMock.printJob.findMany.mockResolvedValue([{ id: "job-ok" }, { id: "job-fail" }]);

    prismaMock.printJob.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "job-ok") {
        return Promise.resolve({
          id: "job-ok",
          workOrderId: "wo-1",
          payloadJson: JSON.stringify({
            title: "ok",
            text: "ok",
            ticketType: "master_customer",
            loadIndex: null
          })
        });
      }
      return Promise.resolve({
        id: "job-fail",
        workOrderId: "wo-2",
        payloadJson: JSON.stringify({
          title: "fail",
          text: "fail",
          ticketType: "master_store",
          loadIndex: null
        })
      });
    });

    printerManagerMock.print.mockResolvedValueOnce({ skipped: false }).mockRejectedValueOnce(new Error("printer offline"));

    prismaMock.printJob.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ id: where.id, ...data })
    );

    const result = await retryFailedPrintJobs({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-23T00:00:00.000Z")
    });

    expect(result).toEqual({
      retriedOk: 1,
      retriedFailed: 1,
      failedIds: ["job-fail"]
    });

    expect(printerManagerMock.print).toHaveBeenCalledTimes(2);
    expect(loggerMock.error).toHaveBeenCalled();
  });
});
