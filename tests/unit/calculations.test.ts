import { describe, expect, it } from "vitest";

import { calculateAddonTotalCents, calculateExpectedCash, calculateLoyaltyDiscountCents, calculateUtilizationPct } from "@/server/services/calculations";

describe("calculateExpectedCash", () => {
  it("computes shift expected cash with deposits and withdrawals", () => {
    const value = calculateExpectedCash({
      startingCashCents: 10_000,
      cashSalesCents: 24_500,
      depositsCents: 2_000,
      withdrawalsCents: 1_500
    });
    expect(value).toBe(35_000);
  });
});

describe("calculateUtilizationPct", () => {
  it("returns rounded percentage", () => {
    expect(calculateUtilizationPct(43, 120)).toBe(35.83);
  });

  it("guards zero window", () => {
    expect(calculateUtilizationPct(10, 0)).toBe(0);
  });
});

describe("calculateLoyaltyDiscountCents", () => {
  it("computes rounded discount by percentage", () => {
    expect(calculateLoyaltyDiscountCents(4_500, 50)).toBe(2_250);
  });

  it("caps percentage and guards invalid values", () => {
    expect(calculateLoyaltyDiscountCents(3_000, 150)).toBe(3_000);
    expect(calculateLoyaltyDiscountCents(3_000, -20)).toBe(0);
  });
});

describe("calculateAddonTotalCents", () => {
  it("sums addon quantities by configured prices", () => {
    expect(
      calculateAddonTotalCents({
        detergentQty: 2,
        softenerQty: 1,
        bleachQty: 3,
        detergentAddonCents: 500,
        softenerAddonCents: 500,
        bleachAddonCents: 500
      })
    ).toBe(3_000);
  });
});
