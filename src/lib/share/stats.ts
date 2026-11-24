import type { Metrics } from "../analytics/metrics";

/**
 * Allowlisted stats that can appear on a card or in a public summary.
 * Each is an integer (plus optional integer denominator) — no free text, no names.
 */
export const STAT_KEYS = [
  "companies", "responses", "interviews", "interviewing", "offers", "busiest_week", "streak", "active_weeks", "roles",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface StatValue {
  key: StatKey;
  value: number;
  of?: number; // denominator, shown explicitly
}

export interface StatDisplay {
  value: string;
  label: string;
}

export function statDisplay(s: StatValue): StatDisplay {
  const v = String(s.value);
  switch (s.key) {
    case "companies":
      return { value: v, label: s.value === 1 ? "company" : "companies" };
    case "responses":
      return { value: s.of ? `${v}/${s.of}` : v, label: s.value === 1 ? "recorded response" : "recorded responses" };
    case "interviews":
      return { value: s.of ? `${v}/${s.of}` : v, label: s.value === 1 ? "reached interview" : "reached interviews" };
    case "interviewing":
      return { value: v, label: "interviewing now" };
    case "offers":
      return { value: v, label: s.value === 1 ? "offer" : "offers" };
    case "busiest_week":
      return { value: v, label: "apps in my busiest week" };
    case "streak":
      return { value: v, label: "day application streak" };
    case "active_weeks":
      return { value: v, label: s.value === 1 ? "week of applying" : "weeks of applying" };
    case "roles":
      return { value: v, label: s.value === 1 ? "role title" : "different role titles" };
  }
}

/** Which stats the data actually supports (never zero-value or misleading ones). */
export function availableStats(m: Metrics): StatValue[] {
  const out: StatValue[] = [];
  if (m.offers.total > 0) out.push({ key: "offers", value: m.offers.total });
  if (m.interviews.source === "history" && m.interviews.recorded > 0)
    out.push({ key: "interviews", value: m.interviews.recorded, of: m.total });
  else if (m.interviews.current > 0) out.push({ key: "interviewing", value: m.interviews.current });
  if (m.companies > 1) out.push({ key: "companies", value: m.companies });
  if (m.dates && m.dates.busiestWeek.count >= 3) out.push({ key: "busiest_week", value: m.dates.busiestWeek.count });
  if (m.responded > 0 && m.statusKnown > 0) out.push({ key: "responses", value: m.responded, of: m.statusKnown });
  if (m.dates && m.dates.longestStreak >= 3) out.push({ key: "streak", value: m.dates.longestStreak });
  if (m.dates && m.dates.activeWeeks >= 3) out.push({ key: "active_weeks", value: m.dates.activeWeeks });
  if (m.roles >= 3) out.push({ key: "roles", value: m.roles });
  return out;
}

export function defaultStatSelection(available: StatValue[]): StatKey[] {
  return available.slice(0, 3).map((s) => s.key);
}
