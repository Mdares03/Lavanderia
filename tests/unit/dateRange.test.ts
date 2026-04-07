import { describe, expect, it } from "vitest";

import { parseDateRange } from "@/server/api/dateRange";

describe("parseDateRange", () => {
  it("parses explicit from/to", () => {
    const params = new URLSearchParams({
      from: "2026-04-05T10:00:00.000Z",
      to: "2026-04-05T18:00:00.000Z"
    });
    const range = parseDateRange(params);
    expect(range.from.toISOString()).toBe("2026-04-05T10:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-04-05T18:00:00.000Z");
  });

  it("throws on inverted range", () => {
    const params = new URLSearchParams({
      from: "2026-04-05T18:00:00.000Z",
      to: "2026-04-05T10:00:00.000Z"
    });
    expect(() => parseDateRange(params)).toThrow("Rango de fechas invalido");
  });
});
