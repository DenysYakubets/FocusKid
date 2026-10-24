/**
 * Calendar math for F6 — pure string functions, deliberately `Date`-free so
 * INV-02/TSC-6 (no wall-clock access outside `wallClock.ts`) stays green.
 * All dates are local `YYYY-MM-DD` strings (the `sessions.local_date` format).
 */

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function parseDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map((part) => Number(part));
  return { year: year!, month: month!, day: day! };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1]!;
}

/** First day of the month containing `date`. */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Shift a `YYYY-MM-01` anchor by `delta` months (may cross years). */
export function addMonths(monthStart: string, delta: number): string {
  const { year, month } = parseDate(monthStart);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

/** Last day (`YYYY-MM-DD`) of the month containing `date`. */
export function lastOfMonth(date: string): string {
  const { year, month } = parseDate(date);
  const last = daysInMonth(year, month);
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export interface MonthGrid {
  monthStart: string;
  monthEnd: string;
  /** Weeks of 7 cells; leading/trailing cells outside the month are `null`. */
  rows: (string | null)[][];
}

/**
 * Builds the 7-column month grid. `firstWeekdayIndex` is the weekday of the
 * month's first day in the app's convention (0 = Monday … 6 = Sunday), which
 * callers take from `wall.weekdayIndex(monthStart)`.
 */
export function buildMonthGrid(anchorDate: string, firstWeekdayIndex: number): MonthGrid {
  const monthStart = firstOfMonth(anchorDate);
  const monthEnd = lastOfMonth(anchorDate);
  const { year, month } = parseDate(monthStart);
  const totalDays = daysInMonth(year, month);

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekdayIndex; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day++) {
    cells.push(`${monthStart.slice(0, 7)}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return { monthStart, monthEnd, rows };
}