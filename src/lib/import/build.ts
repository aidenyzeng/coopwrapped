import type {
  Application, ColumnMapping, DateFormat, FieldKey, ImportResult, Issue, Status, Tri,
} from "../model/types";
import { companyKey, normalizeFlag, normalizeStatus, parseDate, tidyCompany, cleanText, inferDateFormat } from "./normalize";
import { parseTable, stripTitleRows } from "./parse";
import { detectColumns, looksLikeHeaderRow } from "./detect";

export interface ImportOptions {
  /** ISO date used as "today"; injected for deterministic tests. */
  referenceDate: string;
  mapping?: Partial<Pick<ColumnMapping, "byColumn" | "dateFormat">>;
  /** user corrections for unrecognised status wording: cleaned raw → status */
  statusOverrides?: Record<string, Status>;
  /** keep rows flagged as exact duplicates (default false = count once) */
  keepExactDuplicates?: boolean;
  /** override header-row detection */
  hasHeader?: boolean;
}

export interface TableInput {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
}

export function tableFromText(text: string, forceHeader?: boolean): TableInput {
  const parsed = parseTable(text);
  const { rows } = stripTitleRows(parsed.rows);
  if (rows.length === 0) return { headers: [], rows: [], hasHeader: false };
  const hasHeader = forceHeader ?? looksLikeHeaderRow(rows[0], rows[1]);
  const headers = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${String.fromCharCode(65 + (i % 26))}`);
  return { headers, rows: hasHeader ? rows.slice(1) : rows, hasHeader };
}

export function importText(text: string, opts: ImportOptions): ImportResult {
  return importTable(tableFromText(text, opts.hasHeader), opts);
}

export function importTable(table: TableInput, opts: ImportOptions): ImportResult {
  const { headers, rows, hasHeader } = table;
  const detected = detectColumns(headers, rows, hasHeader);
  const byColumn = opts.mapping?.byColumn ?? detected.byColumn;
  // If the user moved the date column, re-infer the format for the new column.
  const dateCol = byColumn.indexOf("appliedDate");
  const inferred =
    dateCol >= 0 && dateCol !== detected.byColumn.indexOf("appliedDate")
      ? inferDateFormat(rows.map((r) => r[dateCol] ?? ""))
      : { format: detected.dateFormat, ambiguous: detected.dateFormatAmbiguous };
  const mapping: ColumnMapping = {
    ...detected,
    byColumn,
    dateFormat: opts.mapping?.dateFormat ?? inferred.format,
    dateFormatAmbiguous: opts.mapping?.dateFormat ? false : inferred.ambiguous,
  };
  const { applications, excludedRows, issues } = buildApplications(rows, mapping, opts);
  return { headers, rows, hasHeader, mapping, applications, excludedRows, issues };
}

const col = (m: ColumnMapping, f: FieldKey) => m.byColumn.indexOf(f);

function flagField(raw: string, present: boolean) {
  if (!present) return { value: null as Tri, raw: "", provenance: "missing" as const };
  const { value } = normalizeFlag(raw);
  return {
    value,
    raw,
    provenance: (value === null ? "missing" : "normalized") as "missing" | "normalized",
  };
}

export function buildApplications(rows: string[][], mapping: ColumnMapping, opts: ImportOptions) {
  const issues: Issue[] = [];
  const excludedRows: number[] = [];
  const cCompany = col(mapping, "company");
  const cRole = col(mapping, "role");
  const cStatus = col(mapping, "status");
  const cDate = col(mapping, "appliedDate");
  const cIntDate = col(mapping, "interviewDate");
  const cIntFlag = col(mapping, "interviewFlag");
  const cOffer = col(mapping, "offerFlag");
  const cAccepted = col(mapping, "acceptedFlag");
  const refYear = +opts.referenceDate.slice(0, 4);

  // fallback year for "Jan 5" style dates: most common explicit year in the column
  let fallbackYear = refYear;
  if (cDate >= 0) {
    const years = new Map<number, number>();
    for (const r of rows) {
      const p = parseDate(r[cDate] ?? "", mapping.dateFormat, 0);
      if (p.iso && !p.yearInferred) years.set(+p.iso.slice(0, 4), (years.get(+p.iso.slice(0, 4)) ?? 0) + 1);
    }
    let best = 0;
    for (const [y, n] of years) if (n > best) [best, fallbackYear] = [n, y];
  }

  const missingCompany: number[] = [];
  const unknownStatus = new Map<string, number[]>();
  const unparsed: number[] = [];
  const ambiguous: number[] = [];
  const future: number[] = [];
  const inferredYear: number[] = [];
  const apps: Application[] = [];

  rows.forEach((r, i) => {
    const companyRaw = cCompany >= 0 ? (r[cCompany] ?? "") : "";
    if (!companyRaw.trim() || /^(total|totals|sum|count)$/i.test(companyRaw.trim())) {
      if (r.some((c) => c.trim())) missingCompany.push(i);
      excludedRows.push(i);
      return;
    }
    const company = tidyCompany(companyRaw);

    // Status
    let status: Application["status"] = { value: null, raw: "", provenance: "missing" };
    let impliesInterview = false;
    if (cStatus >= 0) {
      const raw = r[cStatus] ?? "";
      const key = cleanText(raw);
      const override = opts.statusOverrides?.[key];
      const res = normalizeStatus(raw);
      if (override) {
        status = { value: override, raw, provenance: "normalized", note: `You marked “${raw}” as ${override}` };
      } else if (!res) {
        status = { value: null, raw, provenance: "missing" };
      } else {
        impliesInterview = res.impliesInterview;
        status = {
          value: res.status,
          raw,
          provenance: raw.trim().toLowerCase() === res.status ? "direct" : "normalized",
          note: res.exact ? undefined : `“${raw}” → ${res.status}`,
        };
        if (res.status === "unknown") {
          const list = unknownStatus.get(key) ?? [];
          list.push(i);
          unknownStatus.set(key, list);
        }
      }
    }

    // Applied date
    let appliedDate: Application["appliedDate"] = { value: null, raw: "", provenance: "missing" };
    if (cDate >= 0) {
      const raw = r[cDate] ?? "";
      const p = parseDate(raw, mapping.dateFormat, fallbackYear);
      if (raw.trim() && !p.iso) unparsed.push(i);
      if (p.ambiguous) ambiguous.push(i);
      if (p.yearInferred) inferredYear.push(i);
      if (p.iso && p.iso > opts.referenceDate) future.push(i);
      appliedDate = {
        value: p.iso,
        raw,
        provenance: !p.iso ? "missing" : p.yearInferred ? "inferred" : p.iso === raw.trim() ? "direct" : "normalized",
        note: p.yearInferred ? `Year assumed ${p.iso?.slice(0, 4)}` : undefined,
      };
    }

    // Milestones
    const intDate = flagField(r[cIntDate] ?? "", cIntDate >= 0);
    const intFlag = flagField(r[cIntFlag] ?? "", cIntFlag >= 0);
    let interviewed: Application["interviewed"] =
      intDate.value === true || intFlag.value === true
        ? { value: true, raw: intDate.raw || intFlag.raw, provenance: "normalized" }
        : intFlag.value === false
          ? { value: false, raw: intFlag.raw, provenance: "normalized" }
          : { value: null, raw: "", provenance: "missing" };
    if (interviewed.value !== true && (impliesInterview || status.value === "interviewing")) {
      interviewed = {
        value: true,
        raw: status.raw,
        provenance: "inferred",
        note: status.value === "interviewing" ? "Status says interviewing" : `Status “${status.raw}” mentions an interview`,
      };
    }
    const offerF = flagField(r[cOffer] ?? "", cOffer >= 0);
    const acceptedF = flagField(r[cAccepted] ?? "", cAccepted >= 0);

    apps.push({
      row: i,
      company: {
        value: company,
        raw: companyRaw,
        provenance: company === companyRaw ? "direct" : "normalized",
      },
      companyKey: companyKey(company),
      role: cRole >= 0 && (r[cRole] ?? "").trim()
        ? { value: (r[cRole] ?? "").replace(/\s+/g, " ").trim(), raw: r[cRole], provenance: "direct" }
        : { value: null, raw: "", provenance: "missing" },
      status,
      appliedDate,
      interviewed,
      offer: offerF,
      accepted: acceptedF,
    });
  });

  if (missingCompany.length)
    issues.push({ kind: "missing_company", rows: missingCompany, level: "warn", message: `${plural(missingCompany.length, "row")} without a company name ${verb(missingCompany.length, "is", "are")} skipped.` });
  for (const [key, list] of unknownStatus)
    issues.push({ kind: "unknown_status", rows: list, level: "warn", message: `Status “${rows[list[0]][cStatus]}” wasn’t recognized (${plural(list.length, "row")}).`, statusKey: key });
  if (unparsed.length)
    issues.push({ kind: "unparsed_date", rows: unparsed, level: "warn", message: `${plural(unparsed.length, "date")} couldn’t be read and ${verb(unparsed.length, "is", "are")} treated as missing.` });
  if (mapping.dateFormatAmbiguous && ambiguous.length)
    issues.push({ kind: "ambiguous_date", rows: ambiguous, level: "warn", message: `${plural(ambiguous.length, "date")} like 03/04 could be month-first or day-first. We assumed ${mapping.dateFormat === "dmy" ? "day" : "month"}-first.` });
  if (inferredYear.length)
    issues.push({ kind: "ambiguous_date", rows: inferredYear, level: "info", message: `${plural(inferredYear.length, "date")} had no year; assumed ${fallbackYear}.` });
  if (future.length)
    issues.push({ kind: "future_date", rows: future, level: "warn", message: `${plural(future.length, "date")} ${verb(future.length, "is", "are")} in the future — check the date format.` });

  // Company spelling variants merged by the conservative key
  const variants = new Map<string, Set<string>>();
  for (const a of apps) {
    const s = variants.get(a.companyKey) ?? new Set();
    s.add(a.company.value);
    variants.set(a.companyKey, s);
  }
  // pick the most common spelling as display name
  const display = new Map<string, string>();
  for (const [k] of variants) {
    const counts = new Map<string, number>();
    for (const a of apps) if (a.companyKey === k) counts.set(a.company.value, (counts.get(a.company.value) ?? 0) + 1);
    display.set(k, [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0]);
  }
  for (const a of apps) {
    const d = display.get(a.companyKey)!;
    if (d !== a.company.value) {
      a.company = { value: d, raw: a.company.raw, provenance: "normalized", note: `“${a.company.raw.trim()}” grouped with “${d}”` };
    }
  }
  for (const [k, s] of variants)
    if (s.size > 1)
      issues.push({
        kind: "company_merged",
        rows: apps.filter((a) => a.companyKey === k).map((a) => a.row),
        level: "info",
        message: `Grouped ${[...s].map((x) => `“${x}”`).join(", ")} as one company.`,
      });

  // Duplicates
  const exactSeen = new Map<string, number>();
  const exactDupes: number[] = [];
  const softSeen = new Map<string, number[]>();
  const kept: Application[] = [];
  for (const a of apps) {
    const roleKey = (a.role.value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const exact = [a.companyKey, roleKey, a.appliedDate.value ?? a.appliedDate.raw, a.status.value ?? ""].join("|");
    if (exactSeen.has(exact)) {
      exactDupes.push(a.row);
      if (!opts.keepExactDuplicates) {
        excludedRows.push(a.row);
        continue;
      }
    } else exactSeen.set(exact, a.row);
    kept.push(a);
    if (roleKey) {
      const soft = `${a.companyKey}|${roleKey}`;
      const list = softSeen.get(soft) ?? [];
      list.push(a.row);
      softSeen.set(soft, list);
    }
  }
  if (exactDupes.length)
    issues.push({
      kind: "exact_duplicate",
      rows: exactDupes,
      level: "warn",
      message: opts.keepExactDuplicates
        ? `${plural(exactDupes.length, "row")} ${verb(exactDupes.length, "looks", "look")} like ${verb(exactDupes.length, "an exact duplicate", "exact duplicates")} and ${verb(exactDupes.length, "is", "are")} being counted.`
        : `${plural(exactDupes.length, "row")} ${verb(exactDupes.length, "looks", "look")} like ${verb(exactDupes.length, "an exact duplicate", "exact duplicates")} of earlier rows, so ${verb(exactDupes.length, "it isn’t", "they aren’t")} counted twice.`,
    });
  const soft = [...softSeen.values()].filter((l) => l.length > 1);
  const softRows = soft.flat().filter((r) => !exactDupes.includes(r));
  if (soft.length && softRows.length > soft.length)
    issues.push({
      kind: "possible_duplicate",
      rows: softRows,
      level: "info",
      message: `${plural(soft.length, "company + role pair")} ${verb(soft.length, "appears", "appear")} more than once with different details. Kept them all — re-applications are common.`,
    });

  return { applications: kept, excludedRows: [...new Set(excludedRows)].sort((a, b) => a - b), issues };
}

const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : word.endsWith("y") && !/[aeiou]y$/.test(word) ? word.slice(0, -1) + "ies" : word.endsWith("ch") || word.endsWith("s") ? word + "es" : word + "s"}`;
}

export function withDateFormat(m: ColumnMapping, f: DateFormat): ColumnMapping {
  return { ...m, dateFormat: f, dateFormatAmbiguous: false };
}
