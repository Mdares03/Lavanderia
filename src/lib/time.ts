export function minutesBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function clampRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  const clampedStart = new Date(Math.max(start.getTime(), rangeStart.getTime()));
  const clampedEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
  if (clampedEnd <= clampedStart) {
    return null;
  }
  return { start: clampedStart, end: clampedEnd };
}
