export function calculateExpectedCash(input: {
  startingCashCents: number;
  cashSalesCents: number;
  depositsCents: number;
  withdrawalsCents: number;
}) {
  return input.startingCashCents + input.cashSalesCents + input.depositsCents - input.withdrawalsCents;
}

export function calculateUtilizationPct(usedMinutes: number, totalWindowMinutes: number) {
  if (totalWindowMinutes <= 0) {
    return 0;
  }
  return Number(((usedMinutes / totalWindowMinutes) * 100).toFixed(2));
}

export function calculateLoyaltyDiscountCents(baseAmountCents: number, discountPct: number) {
  if (baseAmountCents <= 0 || discountPct <= 0) {
    return 0;
  }
  const boundedPct = Math.min(100, Math.max(0, discountPct));
  return Math.round((baseAmountCents * boundedPct) / 100);
}

export function calculateAddonTotalCents(input: {
  detergentQty: number;
  softenerQty: number;
  bleachQty: number;
  detergentAddonCents: number;
  softenerAddonCents: number;
  bleachAddonCents: number;
}) {
  return (
    Math.max(0, input.detergentQty) * input.detergentAddonCents +
    Math.max(0, input.softenerQty) * input.softenerAddonCents +
    Math.max(0, input.bleachQty) * input.bleachAddonCents
  );
}
