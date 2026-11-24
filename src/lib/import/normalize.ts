import type { DateFormat, Status, Tri } from "../model/types";

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export interface StatusResult {
  status: Status;
  /** status wording implies an interview happened (e.g. "rejected after interview") */
  impliesInterview: boolean;
  exact: boolean; // raw text was already a canonical word
}

export function cleanText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/+&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Order matters: more specific patterns first.
const STATUS_PATTERNS: [RegExp, Status][] = [
  [/\b(offer (was )?declined|declined (the )?offer|turned (it )?down|reneged)\b/, "declined"],
  [/\b(offer )?rescinded\b/, "unknown"],
  [/\b(accepted|accept(ed)? offer|signed|hired|matched|employed|start(ing)? (in|on|date))\b/, "accepted"],
  [/\b(no offer|not selected|not moving forward|unsuccessful|rejected|rejection|reject|denied|position (was )?filled|filled|turned away|declined by|didn'?t get|did not get|no luck|(they )?said no|no thanks|nope)\b/, "rejected"],
  [/\b(withdr[ae]wn?|withdrew|cancel+ed|pulled out|not interested)\b/, "withdrawn"],
  [/\b(offer|offered|verbal offer|got (an |the )?offer)\b/, "offer"],
  [/\b(interview(ing|ed|s)?|final round|onsite|on site|super ?day|phone screen|first round|second round|2nd round|3rd round|technical round)\b/, "interviewing"],
  [/\b(oa|online assessment|assessment|coding challenge|hackerrank|codesignal|take ?home|screening|recruiter (call|chat|screen))\b/, "screening"],
  [/\b(ghosted|no (response|reply|answer)|never heard( back)?|radio silence|silence|nr|crickets)\b/, "no_response"],
  [/\b(applied|submitted|sent|pending|waiting|in review|under review|in progress|review(ing)?|application received|to hear back|awaiting|tbd|open)\b/, "applied"],
];

const CANONICAL = new Set([
  "applied", "rejected", "interviewing", "interview", "offer", "accepted", "declined",
  "withdrawn", "pending", "ghosted", "no response", "submitted",
]);

/**
 * Normalize free-text status. "declined" on its own is ambiguous (company declined
 * you vs. you declined an offer) — returned as unknown so the user decides.
 */
export function normalizeStatus(raw: string): StatusResult | null {
  const t = cleanText(raw);
  if (!t) return null;
  if (t === "declined") return { status: "unknown", impliesInterview: false, exact: false };
  const impliesInterview =
    /\b(after|post) ?(the )?(final |first |second |phone |technical )?(interview|round|onsite)s?\b/.test(t) ||
    /\binterview(ed)?\b.*\b(reject|no offer|not selected)/.test(t);
  for (const [re, status] of STATUS_PATTERNS) {
    if (re.test(t)) return { status, impliesInterview: impliesInterview && status === "rejected", exact: CANONICAL.has(t) };
  }
  return { status: "unknown", impliesInterview: false, exact: false };
}

export const STATUS_LABELS: Record<Status, string> = {
  applied: "Applied / waiting",
  no_response: "No response",
  rejected: "Rejected",
  interviewing: "Interviewing",
  screening: "Assessment / screen",
  offer: "Offer",
  accepted: "Accepted",
  declined: "Offer declined",
  withdrawn: "Withdrawn",
  unknown: "Unrecognized",
};

/* ------------------------------------------------------------------ */
/* Flags (Interviewed? / Offer? / Accepted?)                           */
/* ------------------------------------------------------------------ */

const TRUTHY = /^(y|yes|yep|yeah|true|t|1|x|done|✓|✔|✔️|✅|got it|received|accepted|offer|interviewed|completed?|\d+ rounds?)$/;
const FALSY = /^(n|no|nope|false|f|0|none|-|–|—|❌|✗|✘|nah|not yet)$/;

export function normalizeFlag(raw: string): { value: Tri; viaDate: boolean } {
  const s = raw.trim().toLowerCase();
  if (!s || s === "n/a" || s === "na" || s === "?" || s === "tbd") return { value: null, viaDate: false };
  if (TRUTHY.test(s) || TRUTHY.test(s.replace(/[!.]+$/, ""))) return { value: true, viaDate: false };
  if (FALSY.test(s)) return { value: false, viaDate: false };
  if (looksLikeDate(s)) return { value: true, viaDate: true };
  // free text like "phone screen + onsite" in an interview column counts as evidence
  if (/[a-z]{3,}/.test(s)) return { value: true, viaDate: false };
  return { value: null, viaDate: false };
}

export function isFlagLike(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return TRUTHY.test(s) || FALSY.test(s);
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const NUMERIC = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:[ t].*)?$/i;
const MONTH_NAME_A = /^(?:[a-z]{3,9},? )?([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,?(?: (\d{2,4}))?$/i; // Jan 5, 2025 / Mon Jan 5
const MONTH_NAME_B = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})\.?,?(?: (\d{2,4}))?$/i; // 5 Jan 2025

export function looksLikeDate(s: string): boolean {
  const t = s.trim();
  return NUMERIC.test(t) || MONTH_NAME_A.test(t) || MONTH_NAME_B.test(t) || isExcelSerial(t);
}

function isExcelSerial(t: string) {
  return /^\d{5}(\.\d+)?$/.test(t) && +t > 36526 && +t < 62000; // 2000..2069
}

export interface NumericDateParts {
  a: number;
  b: number;
  c: number;
}

/** Pull the first two numeric parts of slash dates for format inference. */
export function numericParts(s: string): NumericDateParts | null {
  const m = s.trim().match(NUMERIC);
  if (!m) return null;
  return { a: +m[1], b: +m[2], c: +m[3] };
}

/**
 * Decide the column's date order from all values. Returns the format and whether
 * the choice is a guess (no value disambiguates). yyyy-mm-dd is always "ymd".
 */
export function inferDateFormat(values: string[]): { format: DateFormat; ambiguous: boolean } {
  let mdyEvidence = 0;
  let dmyEvidence = 0;
  let ambiguousCount = 0;
  let ymd = 0;
  for (const v of values) {
    const p = numericParts(v);
    if (!p) continue;
    if (p.a > 31) {
      ymd++;
      continue;
    }
    if (p.a > 12 && p.b <= 12) dmyEvidence++;
    else if (p.b > 12 && p.a <= 12) mdyEvidence++;
    else if (p.a !== p.b) ambiguousCount++;
  }
  if (ymd && !mdyEvidence && !dmyEvidence && !ambiguousCount) return { format: "ymd", ambiguous: false };
  if (dmyEvidence > mdyEvidence) return { format: "dmy", ambiguous: false };
  if (mdyEvidence > 0) return { format: "mdy", ambiguous: false };
  return { format: "mdy", ambiguous: ambiguousCount > 0 };
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export interface DateParse {
  iso: string | null;
  yearInferred: boolean;
  ambiguous: boolean; // day/month order could not be determined from this value alone
}

export function parseDate(raw: string, format: DateFormat, fallbackYear: number): DateParse {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { iso: null, yearInferred: false, ambiguous: false };
  if (isExcelSerial(s)) {
    const ms = Math.round((+s - 25569) * 86400000);
    return { iso: new Date(ms).toISOString().slice(0, 10), yearInferred: false, ambiguous: false };
  }
  const n = s.match(NUMERIC);
  if (n) {
    const [a, b, c] = [+n[1], +n[2], +n[3]];
    if (n[1].length === 4 || a > 31) return { iso: validYmd(a, b, c), yearInferred: false, ambiguous: false };
    const ambiguous = a <= 12 && b <= 12 && a !== b;
    const iso = format === "dmy" ? validYmd(c, b, a) : validYmd(c, a, b);
    return { iso, yearInferred: false, ambiguous };
  }
  const ma = s.match(MONTH_NAME_A);
  if (ma) {
    const m = MONTHS[ma[1].toLowerCase().slice(0, 4)] ?? MONTHS[ma[1].toLowerCase().slice(0, 3)];
    if (m) {
      const y = ma[3] ? +ma[3] : fallbackYear;
      return { iso: validYmd(y, m, +ma[2]), yearInferred: !ma[3], ambiguous: false };
    }
  }
  const mb = s.match(MONTH_NAME_B);
  if (mb) {
    const m = MONTHS[mb[2].toLowerCase().slice(0, 4)] ?? MONTHS[mb[2].toLowerCase().slice(0, 3)];
    if (m) {
      const y = mb[3] ? +mb[3] : fallbackYear;
      return { iso: validYmd(y, m, +mb[1]), yearInferred: !mb[3], ambiguous: false };
    }
  }
  return { iso: null, yearInferred: false, ambiguous: false };
}

/* ------------------------------------------------------------------ */
/* Companies                                                           */
/* ------------------------------------------------------------------ */

const SUFFIXES = /\b(incorporated|inc|corp|corporation|co|company|ltd|limited|llc|llp|plc|gmbh|ulc)\b\.?/g;

/**
 * Conservative grouping key: case, whitespace, punctuation, "&"/"and" and legal
 * suffixes are ignored. Nothing fuzzy — "Meta" and "Metal", or "RBC" and
 * "Royal Bank of Canada", stay distinct.
 */
export function companyKey(raw: string): string {
  let t = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.,'’"()]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = t.replace(SUFFIXES, "").replace(/\s+/g, " ").trim();
  if (stripped) t = stripped;
  return t.replace(/ /g, "");
}

export function tidyCompany(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
