import { APP_DEFAULTS } from "@/lib/config";

export function formatCurrency(cents: number, currency = APP_DEFAULTS.currency) {
  return new Intl.NumberFormat(APP_DEFAULTS.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(cents / 100);
}

export function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(APP_DEFAULTS.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_DEFAULTS.timezone
  }).format(date);
}

export function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs === 0) {
    return `${mins} min`;
  }
  return `${hrs} h ${mins} min`;
}

export function parseMoneyToCents(input: string | number) {
  const value = typeof input === "number" ? input : Number.parseFloat(input);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100);
}
