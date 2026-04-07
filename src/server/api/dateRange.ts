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
