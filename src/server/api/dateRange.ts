export function parseDateRange(params: URLSearchParams) {
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const now = new Date();

  if (!fromRaw || !toRaw) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  }

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Rango de fechas invalido");
  }
  if (to < from) {
    throw new Error("Rango de fechas invalido");
  }
  return { from, to };
}

export type ReportPeriodPreset = "today" | "yesterday" | "last_7" | "this_month" | "custom";

export function parseReportPeriod(params: URLSearchParams): {
  period: ReportPeriodPreset;
  from: Date;
  to: Date;
} {
  const periodRaw = params.get("period")?.trim().toLowerCase() ?? "today";
  const period: ReportPeriodPreset =
    periodRaw === "yesterday" || periodRaw === "last_7" || periodRaw === "this_month" || periodRaw === "custom"
      ? periodRaw
      : "today";

  const now = new Date();
  if (period === "custom") {
    const fromRaw = params.get("from");
    const toRaw = params.get("to");
    if (!fromRaw || !toRaw) {
      throw new Error("Periodo custom requiere from y to");
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      throw new Error("Rango custom invalido");
    }
    return { period, from, to };
  }

  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  if (period === "today") {
    return { period, from: startOfDay(now), to: now };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { period, from: startOfDay(y), to: endOfDay(y) };
  }
  if (period === "last_7") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { period, from, to: now };
  }

  const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  return { period, from, to: now };
}
