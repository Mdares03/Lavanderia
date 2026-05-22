import { formatInTimeZone } from "date-fns-tz";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  appConfig: { findUnique: vi.fn() },
  transaction: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn()
  },
  machine: { findMany: vi.fn() },
  shift: { findFirst: vi.fn() },
  cashDrop: { findMany: vi.fn() },
  encargoOrder: { findMany: vi.fn() },
  availabilityIncident: { findMany: vi.fn() }
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock
}));

import { getAnalyticsExportPack, getReportCsv } from "@/server/services/reportService";

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function mapRows(csv: string) {
  const rows = parseCsv(csv);
  const headers = rows[0] ?? [];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function makeTx(input: {
  id: string;
  ticketNumber: number;
  status: string;
  machineId?: string;
  serviceType?: string;
  paymentMethod?: string;
  amountCents?: number;
  baseAmountCents?: number;
  discountCents?: number;
  addonAmountCents?: number;
  createdAt: string;
  machineName?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
  voidReasonNotes?: string | null;
  voidedByEmployeeId?: string | null;
}) {
  const createdAt = new Date(input.createdAt);
  return {
    id: input.id,
    ticketNumber: input.ticketNumber,
    machineId: input.machineId ?? "m-1",
    machine: { id: input.machineId ?? "m-1", name: input.machineName ?? "Lavadora 1" },
    employeeId: "e-1",
    employee: { id: "e-1", name: "Cajero 1" },
    customerId: "c-1",
    customer: {
      id: "c-1",
      firstName: input.customerFirstName ?? "Juan",
      lastName: input.customerLastName ?? "Perez",
      phone: input.customerPhone ?? "5551112222",
      email: input.customerEmail ?? "juan@example.com"
    },
    baseAmountCents: input.baseAmountCents ?? 1000,
    discountCents: input.discountCents ?? 0,
    loyaltyDiscountApplied: false,
    addonDetergentQty: 0,
    addonSoftenerQty: 0,
    addonBleachQty: 0,
    addonAmountCents: input.addonAmountCents ?? 0,
    serviceType: input.serviceType ?? "autoservicio",
    amountCents: input.amountCents ?? 1000,
    paymentMethod: input.paymentMethod ?? "cash",
    isExtension: false,
    parentTransactionId: null,
    encargoOrderId: null,
    startedAt: createdAt,
    expectedEndAt: new Date(createdAt.getTime() + 30 * 60_000),
    status: input.status,
    endedAt: null,
    voidedAt: input.status === "voided" ? new Date(createdAt.getTime() + 60_000) : null,
    voidedByEmployeeId: input.voidedByEmployeeId ?? null,
    voidedByEmployee: input.voidedByEmployeeId ? { id: input.voidedByEmployeeId } : null,
    relayFailureReason: input.status === "relay_failed" ? "relay timeout" : null,
    voidReason: input.status === "voided" ? "refund" : null,
    voidReasonCode: input.status === "voided" ? "refund" : null,
    voidReasonNotes: input.voidReasonNotes ?? null,
    createdAt,
    updatedAt: createdAt
  };
}

describe("analytics export service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.appConfig.findUnique.mockResolvedValue({ timezone: "America/Monterrey", currency: "MXN" });
  });

  it("exports transaction fact CSV with all statuses and expected columns", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      makeTx({ id: "t1", ticketNumber: 1, status: "pending_relay", createdAt: "2026-05-20T12:10:00.000Z" }),
      makeTx({ id: "t2", ticketNumber: 2, status: "running", createdAt: "2026-05-20T12:20:00.000Z" }),
      makeTx({ id: "t3", ticketNumber: 3, status: "completed", createdAt: "2026-05-20T12:30:00.000Z" }),
      makeTx({ id: "t4", ticketNumber: 4, status: "relay_failed", createdAt: "2026-05-20T12:40:00.000Z" }),
      makeTx({ id: "t5", ticketNumber: 5, status: "voided", createdAt: "2026-05-20T12:50:00.000Z", voidedByEmployeeId: "e-2" })
    ]);

    const pack = await getAnalyticsExportPack({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-21T00:00:00.000Z")
    });

    expect(pack.files.map((file) => file.name)).toEqual(["transactions.csv", "breakdowns.csv", "metadata_totals.csv"]);

    const transactionRows = mapRows(pack.files[0].content);
    expect(transactionRows).toHaveLength(5);
    expect(Object.keys(transactionRows[0])).toEqual([
      "transaction_id",
      "ticket_number",
      "machine_id",
      "machine_name",
      "employee_id",
      "employee_name",
      "customer_id",
      "customer_first_name",
      "customer_last_name",
      "customer_phone",
      "customer_email",
      "status",
      "service_type",
      "payment_method",
      "is_extension",
      "parent_transaction_id",
      "encargo_order_id",
      "base_amount_cents",
      "base_amount",
      "discount_cents",
      "discount_amount",
      "addon_amount_cents",
      "addon_amount",
      "amount_cents",
      "amount",
      "created_at_utc",
      "created_at_local",
      "date_local",
      "hour_local",
      "started_at_utc",
      "expected_end_at_utc",
      "ended_at_utc",
      "voided_at_utc",
      "void_reason",
      "void_reason_code",
      "void_reason_notes",
      "voided_by_employee_id",
      "relay_failure_reason"
    ]);

    const statuses = new Set(transactionRows.map((row) => row.status));
    expect(statuses).toEqual(new Set(["pending_relay", "running", "completed", "relay_failed", "voided"]));
    expect(transactionRows[0].base_amount).toMatch(/\$/);
    expect(transactionRows[0].amount).toMatch(/\$/);
  });

  it("uses configured business timezone for local date and hour buckets", async () => {
    const createdAt = "2026-05-20T19:45:00.000Z";
    prismaMock.transaction.findMany.mockResolvedValue([
      makeTx({ id: "tz-1", ticketNumber: 10, status: "completed", createdAt, amountCents: 1500 })
    ]);

    const pack = await getAnalyticsExportPack({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-21T00:00:00.000Z")
    });

    const [txRow] = mapRows(pack.files[0].content);
    const expectedDate = formatInTimeZone(new Date(createdAt), "America/Monterrey", "yyyy-MM-dd");
    const expectedHour = formatInTimeZone(new Date(createdAt), "America/Monterrey", "HH");

    expect(txRow.date_local).toBe(expectedDate);
    expect(txRow.hour_local).toBe(String(Number(expectedHour)));

    const breakdownRows = mapRows(pack.files[1].content);
    const hourlyRow = breakdownRows.find((row) => row.grain === "hourly");
    expect(hourlyRow?.date_local).toBe(expectedDate);
    expect(hourlyRow?.hour_local).toBe(expectedHour);
  });

  it("reconciles hourly breakdown totals with transaction fact totals", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      makeTx({ id: "r1", ticketNumber: 1, status: "completed", createdAt: "2026-05-20T10:00:00.000Z", amountCents: 1200 }),
      makeTx({ id: "r2", ticketNumber: 2, status: "completed", createdAt: "2026-05-20T11:00:00.000Z", amountCents: 1300 }),
      makeTx({ id: "r3", ticketNumber: 3, status: "voided", createdAt: "2026-05-20T12:00:00.000Z", amountCents: 900, voidedByEmployeeId: "e-3" })
    ]);

    const pack = await getAnalyticsExportPack({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-21T00:00:00.000Z")
    });

    const transactionRows = mapRows(pack.files[0].content);
    const txCount = transactionRows.length;
    const txAmountSum = transactionRows.reduce((sum, row) => sum + Number(row.amount_cents), 0);

    const breakdownRows = mapRows(pack.files[1].content).filter((row) => row.grain === "hourly");
    const breakdownCountSum = breakdownRows.reduce((sum, row) => sum + Number(row.transaction_count), 0);
    const breakdownAmountSum = breakdownRows.reduce((sum, row) => sum + Number(row.amount_cents_sum), 0);

    expect(breakdownCountSum).toBe(txCount);
    expect(breakdownAmountSum).toBe(txAmountSum);
  });

  it("escapes CSV values with commas, quotes, and newlines", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      makeTx({
        id: "esc-1",
        ticketNumber: 9,
        status: "voided",
        createdAt: "2026-05-20T10:00:00.000Z",
        machineName: "Lavadora \"VIP\", Norte",
        customerFirstName: "Ana,\"Mari\"",
        voidReasonNotes: "linea 1\nlinea 2",
        voidedByEmployeeId: "e-7"
      })
    ]);

    const pack = await getAnalyticsExportPack({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-21T00:00:00.000Z")
    });

    expect(pack.files[0].content).toContain('"Lavadora ""VIP"", Norte"');
    expect(pack.files[0].content).toContain('"Ana,""Mari"""');
    expect(pack.files[0].content).toContain('"linea 1\nlinea 2"');
  });

  it("keeps legacy summary CSV contract unchanged", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      makeTx({ id: "l1", ticketNumber: 1, status: "completed", createdAt: "2026-05-20T10:00:00.000Z", amountCents: 1000, paymentMethod: "cash" }),
      makeTx({
        id: "l2",
        ticketNumber: 2,
        status: "completed",
        createdAt: "2026-05-20T11:00:00.000Z",
        amountCents: 2000,
        paymentMethod: "card",
        machineId: "m-2",
        machineName: "Lavadora 2"
      })
    ]);
    prismaMock.transaction.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { amountCents: 500 } });

    const csv = await getReportCsv({
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-21T00:00:00.000Z")
    });

    expect(csv).toContain("Tipo,Clave,Valor1,Valor2");
    expect(csv).toContain("totales,totalRevenueCents,3000,");
    expect(csv).toContain("totales,transactionCount,2,");
    expect(csv).toContain("totales,voidedCount,1,");
    expect(csv).toContain("payment,cash,1000,1");
    expect(csv).toContain("machine,Lavadora 2,2000,1");
  });
});
