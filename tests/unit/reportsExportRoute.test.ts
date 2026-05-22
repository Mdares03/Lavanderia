import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const routeMocks = vi.hoisted(() => ({
  ensureSystemBootstrapped: vi.fn(),
  requireAdminFromRequest: vi.fn(),
  getAnalyticsExportPack: vi.fn(),
  getReportCsv: vi.fn()
}));

vi.mock("@/server/system/bootstrap", () => ({
  ensureSystemBootstrapped: routeMocks.ensureSystemBootstrapped
}));

vi.mock("@/server/services/authService", () => ({
  requireAdminFromRequest: routeMocks.requireAdminFromRequest
}));

vi.mock("@/server/services/reportService", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/reportService")>("@/server/services/reportService");
  return {
    ...actual,
    getAnalyticsExportPack: routeMocks.getAnalyticsExportPack,
    getReportCsv: routeMocks.getReportCsv
  };
});

import { GET } from "@/app/api/reports/export/route";

function listZipEntries(bytes: Uint8Array) {
  const names: string[] = [];
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    names.push(decoder.decode(bytes.slice(nameStart, nameEnd)));
    offset = nameEnd + extraLength + compressedSize;
  }

  return names;
}

describe("/api/reports/export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.ensureSystemBootstrapped.mockResolvedValue(undefined);
    routeMocks.requireAdminFromRequest.mockResolvedValue({ id: "admin-1" });
  });

  it("returns zipped analytics pack by default", async () => {
    routeMocks.getAnalyticsExportPack.mockResolvedValue({
      timezone: "America/Monterrey",
      files: [
        { name: "transactions.csv", content: "a,b\n1,2" },
        { name: "breakdowns.csv", content: "x,y\n3,4" },
        { name: "metadata_totals.csv", content: "k,v\na,b" }
      ]
    });

    const response = await GET(
      new Request("http://localhost/api/reports/export?from=2026-05-20T00:00:00.000Z&to=2026-05-21T00:00:00.000Z", {
        headers: { "x-admin-pin": "1234" }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("X-Export-Timezone")).toBe("America/Monterrey");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(listZipEntries(bytes)).toEqual(["transactions.csv", "breakdowns.csv", "metadata_totals.csv"]);
  });

  it("returns legacy summary CSV when requested", async () => {
    routeMocks.getReportCsv.mockResolvedValue("Tipo,Clave,Valor1,Valor2\ntotales,transactionCount,2,");

    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?from=2026-05-20T00:00:00.000Z&to=2026-05-21T00:00:00.000Z&format=legacy_summary",
        {
          headers: { "x-admin-pin": "1234" }
        }
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(await response.text()).toContain("Tipo,Clave,Valor1,Valor2");
  });

  it("enforces admin auth", async () => {
    routeMocks.requireAdminFromRequest.mockRejectedValue(new Error("No autorizado"));

    const response = await GET(
      new Request("http://localhost/api/reports/export?from=2026-05-20T00:00:00.000Z&to=2026-05-21T00:00:00.000Z")
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("No fue posible exportar reporte");
  });

  it("returns 400 on invalid export format", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/reports/export?from=2026-05-20T00:00:00.000Z&to=2026-05-21T00:00:00.000Z&format=xml"
      )
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Formato de exportacion invalido");
  });
});
