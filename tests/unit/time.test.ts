import { describe, expect, it } from "vitest";

import { addMinutes, clampRange, minutesBetween } from "@/lib/time";

describe("time helpers", () => {
  it("adds minutes correctly", () => {
    const base = new Date("2026-04-06T10:00:00.000Z");
    const result = addMinutes(base, 35);
    expect(result.toISOString()).toBe("2026-04-06T10:35:00.000Z");
  });

  it("returns overlap range", () => {
    const overlap = clampRange(
      new Date("2026-04-06T10:00:00.000Z"),
      new Date("2026-04-06T11:00:00.000Z"),
      new Date("2026-04-06T10:30:00.000Z"),
      new Date("2026-04-06T12:00:00.000Z")
    );
    expect(overlap?.start.toISOString()).toBe("2026-04-06T10:30:00.000Z");
    expect(overlap?.end.toISOString()).toBe("2026-04-06T11:00:00.000Z");
    expect(minutesBetween(overlap!.start, overlap!.end)).toBe(30);
  });
});
