import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const routeMocks = vi.hoisted(() => ({
  ensureSystemBootstrapped: vi.fn(),
  requireEmployeeFromRequest: vi.fn(),
  listPrintJobs: vi.fn(),
  retryPrintJob: vi.fn(),
  retryFailedPrintJobs: vi.fn()
}));

vi.mock("@/server/system/bootstrap", () => ({
  ensureSystemBootstrapped: routeMocks.ensureSystemBootstrapped
}));

vi.mock("@/server/services/authService", () => ({
  requireEmployeeFromRequest: routeMocks.requireEmployeeFromRequest
}));

vi.mock("@/server/services/printerService", () => ({
  listPrintJobs: routeMocks.listPrintJobs,
  retryPrintJob: routeMocks.retryPrintJob,
  retryFailedPrintJobs: routeMocks.retryFailedPrintJobs
}));

import { GET as getPrintJobs } from "@/app/api/print-jobs/route";
import { POST as retrySingleJob } from "@/app/api/print-jobs/[id]/retry/route";
import { POST as retryFailedJobs } from "@/app/api/print-jobs/retry-failed/route";

describe("print jobs routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.ensureSystemBootstrapped.mockResolvedValue(undefined);
    routeMocks.requireEmployeeFromRequest.mockResolvedValue({ id: "emp-1" });
  });

  it("GET /api/print-jobs returns filtered rows with cursor payload", async () => {
    routeMocks.listPrintJobs.mockResolvedValue({
      items: [
        {
          id: "job-1",
          workOrderId: "wo-1",
          workOrderNumber: 1001,
          ticketType: "master_store",
          loadIndex: null,
          status: "failed",
          attemptCount: 1,
          lastError: "offline",
          printedAt: null,
          createdAt: "2026-05-22T10:00:00.000Z",
          ticketPreview: { title: "t", text: "x" }
        }
      ],
      hasMore: true,
      nextCursor: "abc"
    });

    const response = await getPrintJobs(
      new Request(
        "http://localhost/api/print-jobs?from=2026-05-20T00:00:00.000Z&to=2026-05-22T23:59:59.999Z&status=failed&workOrderNumber=1001&limit=10",
        {
          headers: { "x-session-pin": "1234" }
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBe("abc");

    expect(routeMocks.listPrintJobs).toHaveBeenCalledTimes(1);
    expect(routeMocks.listPrintJobs.mock.calls[0]?.[0]).toMatchObject({
      status: "failed",
      workOrderNumber: 1001,
      limit: 10
    });
  });

  it("GET /api/print-jobs rejects request without valid cashier session", async () => {
    routeMocks.requireEmployeeFromRequest.mockRejectedValue(new Error("PIN de sesion requerido"));

    const response = await getPrintJobs(new Request("http://localhost/api/print-jobs"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("No fue posible consultar historial de impresiones");
  });

  it("POST /api/print-jobs/retry-failed retries using current filters", async () => {
    routeMocks.retryFailedPrintJobs.mockResolvedValue({
      retriedOk: 3,
      retriedFailed: 1,
      failedIds: ["job-9"]
    });

    const response = await retryFailedJobs(
      new Request("http://localhost/api/print-jobs/retry-failed?from=2026-05-21T00:00:00.000Z&to=2026-05-22T23:59:59.999Z&workOrderNumber=88", {
        method: "POST",
        headers: { "x-session-pin": "1234" }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ retriedOk: 3, retriedFailed: 1, failedIds: ["job-9"] });
    expect(routeMocks.retryFailedPrintJobs).toHaveBeenCalledTimes(1);
    expect(routeMocks.retryFailedPrintJobs.mock.calls[0]?.[0]).toMatchObject({
      workOrderNumber: 88
    });
  });

  it("POST /api/print-jobs/[id]/retry enforces cashier auth and retries row", async () => {
    routeMocks.retryPrintJob.mockResolvedValue({ id: "job-4", status: "printed" });

    const okResponse = await retrySingleJob(
      new Request("http://localhost/api/print-jobs/job-4/retry", {
        method: "POST",
        headers: { "x-session-pin": "1234" }
      }),
      { params: Promise.resolve({ id: "job-4" }) }
    );

    expect(okResponse.status).toBe(200);
    expect(routeMocks.retryPrintJob).toHaveBeenCalledWith("job-4");

    routeMocks.requireEmployeeFromRequest.mockRejectedValueOnce(new Error("PIN de sesion requerido"));

    const denied = await retrySingleJob(new Request("http://localhost/api/print-jobs/job-4/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "job-4" })
    });

    expect(denied.status).toBe(403);
  });
});
