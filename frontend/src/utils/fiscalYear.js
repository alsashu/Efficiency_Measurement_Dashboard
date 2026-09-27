// Fiscal-year helpers — April–March fiscal year (project-wide convention, see
// planAnalyticsController.js's periodType:'financial' handling).
//
// A fiscal year is identified by its START calendar year:
//   FY 2024-25  →  fy = 2024  →  01-Apr-2024 … 31-Mar-2025
//
// Quarters:  Q1 Apr–Jun · Q2 Jul–Sep · Q3 Oct–Dec · Q4 Jan–Mar

const envInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

// Default FY range for the Programs page. Override per deployment with
// VITE_PROGRAMS_DEFAULT_START_FY / VITE_PROGRAMS_DEFAULT_END_FY (FY start years,
// e.g. 2024 and 2025 for FY 2024-25 → FY 2025-26).
export const DEFAULT_FY_RANGE = {
  startFy: envInt(env.VITE_PROGRAMS_DEFAULT_START_FY) ?? 2024,
  endFy: envInt(env.VITE_PROGRAMS_DEFAULT_END_FY) ?? 2025,
};

/** Fiscal year (start year) that contains the given date. */
export function fiscalYearOf(date) {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Fiscal quarter (1–4) of the given date: Q1 Apr–Jun … Q4 Jan–Mar. */
export function fiscalQuarterOf(date) {
  return Math.floor(((date.getMonth() + 9) % 12) / 3) + 1;
}

/** "FY 2024-25" */
export function fyLabel(fy) {
  return `FY ${fy}-${String(fy + 1).slice(-2)}`;
}

/** First day of the fiscal year (01-Apr-fy, local midnight). */
export function fyStartDate(fy) {
  return new Date(fy, 3, 1);
}

/** Last day of the fiscal year (31-Mar-(fy+1), local midnight). */
export function fyEndDate(fy) {
  return new Date(fy + 1, 2, 31);
}

/** Resolve an FY range into its Start/End dates: FY a → FY b = 01-Apr-a … 31-Mar-(b+1). */
export function resolveFyRange(startFy, endFy) {
  const lo = Math.min(startFy, endFy);
  const hi = Math.max(startFy, endFy);
  return { start: fyStartDate(lo), end: fyEndDate(hi) };
}

/** Date range of a fiscal quarter. */
export function fiscalQuarterRange(fy, quarter) {
  const startMonth = 3 + (quarter - 1) * 3; // Apr=3, Jul=6, Oct=9, Jan=12 (→ next year)
  const start = new Date(fy, startMonth, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  return { start, end };
}

/**
 * If [start, end] exactly spans whole fiscal years, return { startFy, endFy };
 * otherwise null (a custom Time Interval).
 */
export function fyRangeFromDates(start, end) {
  if (!start || !end) return null;
  const isFyStart = start.getMonth() === 3 && start.getDate() === 1;
  const isFyEnd = end.getMonth() === 2 && end.getDate() === 31;
  if (!isFyStart || !isFyEnd) return null;
  const startFy = start.getFullYear();
  const endFy = end.getFullYear() - 1;
  return endFy >= startFy ? { startFy, endFy } : null;
}
