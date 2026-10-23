// Display-only working-days estimate (BRD §4.1). The server preview and the
// submit response are authoritative (weekends + holiday calendar).

/** Weekdays (Mon–Fri) between two ISO dates, inclusive. Reversed dates → 0. */
export function estimateWorkingDays(startDateIso: string, endDateIso: string): number {
  const start = Date.parse(startDateIso);
  const end = Date.parse(endDateIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  let count = 0;
  for (let day = start; day <= end; day += 86_400_000) {
    const weekday = new Date(day).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
