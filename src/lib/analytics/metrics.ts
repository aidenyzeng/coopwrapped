import type { Application, ImportResult, FieldKey, Status } from "../model/types";

/**
 * Pure metric computation. Semantics (see README "Metric semantics"):
 *  - Status is the CURRENT status only; it doesn't tell us full history.
 *  - Interview history is only claimed when an interview milestone column exists
 *    (or the status wording itself says an interview happened).
 *  - Offers come from offer/accepted/declined statuses or an offer milestone.
 *    Accepted implies offer; it does NOT imply a recorded interview.
 *  - Applications without a response are "no recorded response", never "ghosted".
 */

export const RESPONDED: Status[] = ["rejected", "screening", "interviewing", "offer", "accepted", "declined"];
export const WAITING: Status[] = ["applied", "no_response"];
export const AGED_DAYS = 30;

export interface DateStats {
  dated: number;
  coverage: number; // dated / total
  first: string;
  last: string;
  spanDays: number;
  busiestWeek: { start: string; count: number };
  busiestMonth: { month: string; count: number }; // yyyy-mm
  maxIn7Days: number; // max applications in any rolling 7-day window
  burstShare: number; // maxIn7Days / dated
  activeWeeks: number;
  activeDays: number;
  longestStreak: number; // consecutive days with ≥1 application
  weekdayCounts: number[]; // Mon..Sun
  weekendCount: number;
  weekly: { start: string; count: number }[]; // contiguous weeks first..last
}

export interface Metrics {
  total: number;
  companies: number;
  roles: number; // distinct role titles
  hasStatus: boolean;
  statusCounts: Record<Status, number>;
  /** applications whose status could be classified (not null/unknown) */
  statusKnown: number;
  /** blank status cells (only when a status column exists) */
  statusBlank: number;
  responded: number;
  waiting: number; // applied + no_response
  withdrawn: number;
  /** waiting apps with an applied date ≥ 30 days before the reference date */
  waitingAged: number | null;
  interviews: {
    /** "history": an interview milestone column exists; "current": only current status; "none": no evidence possible */
    source: "history" | "current" | "none";
    recorded: number; // apps with interview evidence (history or inferred)
    current: number; // status interviewing right now
  };
  offers: {
    total: number;
    accepted: number;
    /** offer counted only from statuses/milestones actually present */
    source: "status" | "milestone" | "both" | "none";
  };
  dates: DateStats | null; // null when too few dates to say anything
  repeats: { maxPerCompany: number; companiesApplied2Plus: number };
  smallSample: boolean;
}

const ALL_STATUSES: Status[] = ["applied", "no_response", "rejected", "screening", "interviewing", "offer", "accepted", "declined", "withdrawn", "unknown"];

const DAY = 86400000;
const toDay = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
/** Monday-based week start */
const weekStart = (d: number) => d - ((new Date(d * DAY).getUTCDay() + 6) % 7);

export function computeMetrics(apps: Application[], referenceDate: string, opts?: { hasStatusColumn?: boolean; hasInterviewColumn?: boolean; hasOfferColumn?: boolean; hasAcceptedColumn?: boolean }): Metrics {
  const total = apps.length;
  const statusCounts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const a of apps) if (a.status.value) statusCounts[a.status.value]++;
  const hasStatus = opts?.hasStatusColumn ?? apps.some((a) => a.status.value !== null);
  const statusKnown = ALL_STATUSES.filter((s) => s !== "unknown").reduce((n, s) => n + statusCounts[s], 0);
  const responded = RESPONDED.reduce((n, s) => n + statusCounts[s], 0);
  const waiting = WAITING.reduce((n, s) => n + statusCounts[s], 0);

  // Interviews
  const hasInterviewColumn = opts?.hasInterviewColumn ?? apps.some((a) => a.interviewed.provenance === "normalized");
  const recorded = apps.filter((a) => a.interviewed.value === true).length;
  const current = statusCounts.interviewing;
  const interviews: Metrics["interviews"] = {
    source: hasInterviewColumn ? "history" : hasStatus ? "current" : "none",
    recorded,
    current,
  };

  // Offers
  const hasOfferColumn = opts?.hasOfferColumn ?? apps.some((a) => a.offer.provenance !== "missing");
  const hasAcceptedColumn = opts?.hasAcceptedColumn ?? apps.some((a) => a.accepted.provenance !== "missing");
  const isAccepted = (a: Application) => a.status.value === "accepted" || a.accepted.value === true;
  const isOffer = (a: Application) =>
    isAccepted(a) || a.offer.value === true || a.status.value === "offer" || a.status.value === "declined";
  const offers: Metrics["offers"] = {
    total: apps.filter(isOffer).length,
    accepted: apps.filter(isAccepted).length,
    source: hasOfferColumn || hasAcceptedColumn ? (hasStatus ? "both" : "milestone") : hasStatus ? "status" : "none",
  };

  // Dates
  const dated = apps.filter((a) => a.appliedDate.value && a.appliedDate.value <= referenceDate).map((a) => toDay(a.appliedDate.value!));
  const ref = toDay(referenceDate);
  const waitingAged = apps.some((a) => a.appliedDate.value)
    ? apps.filter((a) => a.status.value && WAITING.includes(a.status.value) && a.appliedDate.value && ref - toDay(a.appliedDate.value) >= AGED_DAYS).length
    : null;
  const dates = dated.length >= 5 && dated.length / Math.max(1, total) >= 0.5 ? dateStats(dated, total) : null;

  // Repeats
  const perCompany = new Map<string, number>();
  for (const a of apps) perCompany.set(a.companyKey, (perCompany.get(a.companyKey) ?? 0) + 1);
  const counts = [...perCompany.values()];

  return {
    total,
    companies: perCompany.size,
    roles: new Set(apps.map((a) => a.role.value?.toLowerCase().replace(/\s+/g, " ")).filter(Boolean)).size,
    hasStatus,
    statusCounts,
    statusKnown,
    statusBlank: hasStatus ? apps.filter((a) => a.status.value === null).length : 0,
    responded,
    waiting,
    withdrawn: statusCounts.withdrawn,
    waitingAged,
    interviews,
    offers,
    dates,
    repeats: { maxPerCompany: counts.length ? Math.max(...counts) : 0, companiesApplied2Plus: counts.filter((c) => c >= 2).length },
    smallSample: total < 8,
  };
}

function dateStats(days: number[], total: number): DateStats {
  const sorted = [...days].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const byDay = new Map<number, number>();
  for (const d of sorted) byDay.set(d, (byDay.get(d) ?? 0) + 1);

  // weeks
  const byWeek = new Map<number, number>();
  for (const d of sorted) byWeek.set(weekStart(d), (byWeek.get(weekStart(d)) ?? 0) + 1);
  let busiestWeek = { start: 0, count: 0 };
  for (const [w, c] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) if (c > busiestWeek.count) busiestWeek = { start: w, count: c };
  const weekly: { start: string; count: number }[] = [];
  for (let w = weekStart(first); w <= weekStart(last); w += 7) weekly.push({ start: fromDay(w), count: byWeek.get(w) ?? 0 });

  // months
  const byMonth = new Map<string, number>();
  for (const d of sorted) {
    const m = fromDay(d).slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  let busiestMonth = { month: "", count: 0 };
  for (const [m, c] of [...byMonth.entries()].sort()) if (c > busiestMonth.count) busiestMonth = { month: m, count: c };

  // rolling 7-day window
  let maxIn7Days = 0;
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi++) {
    while (sorted[hi] - sorted[lo] >= 7) lo++;
    maxIn7Days = Math.max(maxIn7Days, hi - lo + 1);
  }

  // streak
  const uniqueDays = [...byDay.keys()].sort((a, b) => a - b);
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    run = uniqueDays[i] === uniqueDays[i - 1] + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of sorted) weekdayCounts[(new Date(d * DAY).getUTCDay() + 6) % 7]++;

  return {
    dated: sorted.length,
    coverage: sorted.length / Math.max(1, total),
    first: fromDay(first),
    last: fromDay(last),
    spanDays: last - first + 1,
    busiestWeek: { start: fromDay(busiestWeek.start), count: busiestWeek.count },
    busiestMonth,
    maxIn7Days,
    burstShare: maxIn7Days / sorted.length,
    activeWeeks: byWeek.size,
    activeDays: byDay.size,
    longestStreak,
    weekdayCounts,
    weekendCount: weekdayCounts[5] + weekdayCounts[6],
    weekly,
  };
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(yyyyMm: string) {
  return MONTH_NAMES[+yyyyMm.slice(5, 7) - 1];
}
export function shortDate(iso: string) {
  return `${MONTH_NAMES[+iso.slice(5, 7) - 1].slice(0, 3)}\u00a0${+iso.slice(8, 10)}`;
}

/** Stable numeric hash of aggregate metrics (no company names) → visual seed. */
export function metricsSeed(m: Metrics): number {
  const s = [m.total, m.companies, m.responded, m.offers.total, m.interviews.recorded, m.dates?.maxIn7Days ?? 0, m.dates?.first ?? ""].join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function analyze(result: ImportResult, referenceDate: string): Metrics {
  const has = (f: FieldKey) => result.mapping.byColumn.includes(f);
  return computeMetrics(result.applications, referenceDate, {
    hasStatusColumn: has("status"),
    hasInterviewColumn: has("interviewDate") || has("interviewFlag"),
    hasOfferColumn: has("offerFlag"),
    hasAcceptedColumn: has("acceptedFlag"),
  });
}
