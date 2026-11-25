import type { ColumnMapping, FieldKey } from "../model/types";
import { cleanText, inferDateFormat, isFlagLike, looksLikeDate, normalizeStatus } from "./normalize";

/**
 * Confidence-based column detection. Each column gets a score per field from
 * (a) header aliases and (b) value patterns; fields are then assigned greedily by
 * score so each field is used at most once.
 */

const ALIASES: Record<FieldKey, { exact: string[]; contains: string[] }> = {
  company: {
    exact: ["company", "company name", "name", "employer", "organization", "organisation", "org", "firm", "business", "where", "employer name"],
    contains: ["company", "employer", "organi", "firm"],
  },
  role: {
    exact: ["role", "position", "title", "job", "job title", "position title", "posting", "job posting", "role title", "team"],
    contains: ["role", "position", "title", "job"],
  },
  status: {
    exact: ["status", "stage", "result", "outcome", "state", "current status", "app status", "application status", "progress", "update", "response"],
    contains: ["status", "stage", "outcome", "result"],
  },
  appliedDate: {
    exact: ["date", "applied", "date applied", "applied on", "application date", "submitted", "date submitted", "applied date", "when", "sent", "date sent", "submission date"],
    contains: ["applied", "submitted", "application date", "date"],
  },
  interviewDate: {
    exact: ["interview date", "interview on", "interviewed on", "date of interview", "interview scheduled"],
    contains: ["interview date", "interview on"],
  },
  interviewFlag: {
    exact: ["interview", "interviewed", "interview?", "interviewed?", "got interview", "interview y/n", "interviews", "rounds"],
    contains: ["interview"],
  },
  offerFlag: {
    exact: ["offer", "offer?", "got offer", "offer received", "offered", "offer y/n"],
    contains: ["offer"],
  },
  acceptedFlag: {
    exact: ["accepted", "accepted?", "accepted offer", "signed", "decision", "final decision"],
    contains: ["accept"],
  },
  location: {
    exact: ["location", "city", "where located", "office", "remote", "country"],
    contains: ["location", "city"],
  },
  notes: {
    exact: ["notes", "note", "comments", "comment", "link", "url", "contact", "salary", "pay", "wage", "deadline", "source", "referral", "term"],
    contains: ["note", "comment", "link", "url"],
  },
};

const ROLE_WORDS =
  /\b(intern|internship|co-?op|developer|engineer|engineering|analyst|designer|scientist|associate|assistant|manager|software|data|product|research|marketing|developer|swe|sde|qa|test|devops|frontend|backend|full ?stack|ml|ai|it|support|consultant|coordinator|technician|specialist)\b/i;

function headerScore(header: string, field: FieldKey): number {
  const h = cleanText(header).replace(/\s*\?$/, "?");
  if (!h) return 0;
  const a = ALIASES[field];
  if (a.exact.includes(h) || a.exact.includes(h.replace(/\?$/, ""))) return 1;
  if (a.contains.some((c) => h.includes(c))) return 0.7;
  return 0;
}

interface ColumnProfile {
  nonEmpty: number;
  dateShare: number;
  statusShare: number;
  flagShare: number;
  roleShare: number;
  textShare: number;
  uniqueShare: number;
  avgLen: number;
}

function profile(values: string[]): ColumnProfile {
  const v = values.filter((x) => x.trim() !== "");
  const n = v.length || 1;
  const known = v.filter((x) => {
    const s = normalizeStatus(x);
    return s && s.status !== "unknown";
  }).length;
  return {
    nonEmpty: v.length,
    dateShare: v.filter(looksLikeDate).length / n,
    statusShare: known / n,
    flagShare: v.filter(isFlagLike).length / n,
    roleShare: v.filter((x) => ROLE_WORDS.test(x)).length / n,
    textShare: v.filter((x) => /[a-z]/i.test(x) && !looksLikeDate(x)).length / n,
    uniqueShare: new Set(v.map((x) => x.toLowerCase())).size / n,
    avgLen: v.reduce((s, x) => s + x.length, 0) / n,
  };
}

function valueScore(p: ColumnProfile, field: FieldKey): number {
  if (p.nonEmpty === 0) return 0;
  switch (field) {
    case "company":
      // short-ish free text, not role-like, not status, varied
      return p.textShare > 0.8 && p.avgLen < 40 && p.roleShare < 0.4 && p.statusShare < 0.3 && p.flagShare < 0.3
        ? 0.45 + 0.15 * Math.min(1, p.uniqueShare * 1.5)
        : 0;
    case "role":
      return p.roleShare > 0.4 ? 0.4 + 0.3 * p.roleShare : 0;
    case "status":
      return p.statusShare > 0.5 && p.uniqueShare < 0.6 ? 0.4 + 0.4 * p.statusShare : p.statusShare > 0.5 ? 0.35 : 0;
    case "appliedDate":
      return p.dateShare > 0.6 ? 0.45 + 0.2 * p.dateShare : 0;
    case "interviewDate":
      // milestone dates are usually sparse, so judge only the filled cells
      return p.dateShare > 0.6 ? 0.45 : 0;
    case "interviewFlag":
    case "offerFlag":
    case "acceptedFlag":
      return p.flagShare > 0.6 ? 0.25 : 0;
    case "notes":
      return p.avgLen > 40 ? 0.3 : 0;
    default:
      return 0;
  }
}

const FIELD_ORDER: FieldKey[] = [
  "company", "status", "appliedDate", "role", "interviewDate", "interviewFlag", "offerFlag", "acceptedFlag", "location", "notes",
];

export function looksLikeHeaderRow(row: string[], next: string[] | undefined): boolean {
  const aliasHits = row.filter((c) => FIELD_ORDER.some((f) => headerScore(c, f) >= 0.7)).length;
  if (aliasHits >= 1 && aliasHits >= Math.ceil(row.filter(Boolean).length / 3)) return true;
  if (!next) return false;
  // header if first row has no dates but the next row does
  const dates0 = row.filter(looksLikeDate).length;
  const dates1 = next.filter(looksLikeDate).length;
  return dates0 === 0 && dates1 > 0 && row.every((c) => c.length < 40);
}

export function detectColumns(headers: string[], dataRows: string[][], hasHeader: boolean): ColumnMapping {
  const cols = headers.length;
  const scores: number[][] = []; // [col][fieldIdx]
  const reasons: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const values = dataRows.map((r) => r[c] ?? "");
    const p = profile(values);
    scores[c] = [];
    reasons[c] = [];
    for (const f of FIELD_ORDER) {
      const hs = hasHeader ? headerScore(headers[c], f) : 0;
      const vs = valueScore(p, f);
      // header and values agreeing is strongest; header alone beats values alone
      let s = hs > 0 && vs > 0 ? Math.min(1, 0.6 * hs + 0.6 * vs) : hs > 0 ? 0.55 + 0.35 * hs : vs;
      // an exact header alias that the values also support beats a looser alias
      if (hs === 1 && vs > 0) s = Math.min(1, s + 0.1);
      // header says date but values aren't dates → penalise
      if ((f === "appliedDate" || f === "interviewDate") && hs > 0 && p.nonEmpty > 0 && p.dateShare < 0.3) s *= 0.4;
      if (f === "status" && hs > 0 && p.nonEmpty > 2 && p.statusShare < 0.2 && p.dateShare > 0.5) s *= 0.3;
      // a yes/no column is a milestone flag, not a status, whatever its header says
      if (f === "status" && p.nonEmpty > 2 && p.flagShare > 0.6) s *= 0.3;
      // yes/no values alone can't tell us WHICH milestone a column records
      if ((f === "interviewFlag" || f === "offerFlag" || f === "acceptedFlag") && hs === 0) s = 0;
      scores[c].push(s);
      reasons[c].push(
        hs > 0 && vs > 0
          ? `Header and values match ${f}`
          : hs > 0
            ? `Header “${headers[c]}” matches`
            : vs > 0
              ? "Inferred from values"
              : "",
      );
    }
  }

  // Greedy assignment: highest (column, field) pairs first.
  const pairs: { c: number; f: number; s: number }[] = [];
  for (let c = 0; c < cols; c++) for (let f = 0; f < FIELD_ORDER.length; f++) if (scores[c][f] > 0.2) pairs.push({ c, f, s: scores[c][f] });
  // tie-break deterministically: score desc, then field priority, then column index
  pairs.sort((x, y) => y.s - x.s || x.f - y.f || x.c - y.c);
  const byColumn: (FieldKey | null)[] = Array(cols).fill(null);
  const confidence: number[] = Array(cols).fill(0);
  const why: string[] = Array(cols).fill("Not used");
  const usedFields = new Set<number>();
  for (const { c, f, s } of pairs) {
    // notes/location are informational and may cover several columns
    const multi = FIELD_ORDER[f] === "notes" || FIELD_ORDER[f] === "location";
    if (byColumn[c] !== null || (usedFields.has(f) && !multi)) continue;
    byColumn[c] = FIELD_ORDER[f];
    confidence[c] = Math.round(s * 100) / 100;
    why[c] = reasons[c][f];
    usedFields.add(f);
  }

  // Company is required: if missing, take the most company-like unassigned text column.
  if (!byColumn.includes("company")) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < cols; c++) {
      if (byColumn[c] !== null) continue;
      const p = profile(dataRows.map((r) => r[c] ?? ""));
      const s = p.textShare * (p.roleShare < 0.5 ? 1 : 0.3) * (p.statusShare < 0.5 ? 1 : 0.2);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best >= 0) {
      byColumn[best] = "company";
      confidence[best] = 0.3;
      why[best] = "Best guess, please confirm";
    }
  }

  const dateCol = byColumn.indexOf("appliedDate");
  const { format, ambiguous } =
    dateCol >= 0 ? inferDateFormat(dataRows.map((r) => r[dateCol] ?? "")) : { format: "mdy" as const, ambiguous: false };

  return { byColumn, confidence, reasons: why, dateFormat: format, dateFormatAmbiguous: ambiguous };
}
