"use client";

import { useMemo } from "react";
import { FIELD_LABELS, type FieldKey, type ImportResult, type Status } from "@/lib/model/types";
import { STATUS_LABELS } from "@/lib/import/normalize";
import type { Analysis } from "@/lib/pipeline";
import type { Corrections } from "./MakeFlow";

const FIELDS = Object.keys(FIELD_LABELS) as FieldKey[];
const STATUS_CHOICES: Status[] = ["applied", "no_response", "rejected", "screening", "interviewing", "offer", "accepted", "declined", "withdrawn"];

function confidenceLabel(c: number) {
  return c >= 0.8 ? { text: "Sure", cls: "bg-mint" } : c >= 0.5 ? { text: "Likely", cls: "bg-sun" } : c > 0 ? { text: "Guess", cls: "bg-pink" } : { text: "", cls: "" };
}

export function ReviewStep({
  result,
  analysis,
  corrections,
  onChange,
  onBack,
  onPlay,
  busy,
}: {
  result: ImportResult;
  analysis: Analysis | null;
  corrections: Corrections;
  onChange: (c: Corrections) => void;
  onBack: () => void;
  onPlay: () => void;
  busy: boolean;
}) {
  const { headers, rows, mapping, issues } = result;
  const hasCompany = mapping.byColumn.includes("company");
  const dateCol = mapping.byColumn.indexOf("appliedDate");

  const setField = (col: number, field: FieldKey | null) => {
    const next = mapping.byColumn.map((f, i) => {
      if (i === col) return field;
      // one column per field (notes/location may repeat)
      if (field && f === field && field !== "notes" && field !== "location") return null;
      return f;
    });
    onChange({ ...corrections, byColumn: next, dateFormat: undefined });
  };

  const uncertainRows = useMemo(() => {
    const set = new Set<number>();
    for (const i of issues) if (i.level === "warn") for (const r of i.rows) set.add(r);
    return [...set].sort((a, b) => a - b);
  }, [issues]);

  const unknown = issues.filter((i) => i.kind === "unknown_status");
  const dupes = issues.find((i) => i.kind === "exact_duplicate");
  const otherIssues = issues.filter((i) => i.kind !== "unknown_status");
  const m = analysis?.metrics;
  const count = result.applications.length;

  return (
    <section aria-labelledby="review-title" className="pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="review-title" className="font-pixel text-[clamp(2rem,6vw,3.4rem)] leading-[1]">
            {count} {count === 1 ? "application" : "applications"} found
          </h1>
          <p className="mt-2 text-muted">
            {m ? `${m.companies} ${m.companies === 1 ? "company" : "companies"}` : `${rows.length} ${rows.length === 1 ? "row" : "rows"}`}
            {result.excludedRows.length ? `, ${result.excludedRows.length} rows skipped` : ""}. Check the columns, then play.
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" className="mbtn mbtn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="mbtn mbtn-blue" onClick={onPlay} disabled={!hasCompany || count === 0 || busy} data-testid="play-story">
            Play my story
          </button>
        </div>
      </div>

      {!hasCompany ? (
        <p role="alert" className="mt-5 rounded-xl border border-tomato bg-tomato/10 p-3 font-semibold">
          Pick the column with company names.
        </p>
      ) : null}

      <h2 className="mt-10 text-xl font-extrabold">Columns</h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-black/10 bg-white">
        {headers.map((h, c) => {
          const conf = confidenceLabel(mapping.confidence[c]);
          const examples = rows
            .map((r) => r[c])
            .filter(Boolean)
            .slice(0, 3);
          return (
            <li key={c} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-bold">{h || `Column ${c + 1}`}</p>
                <p className="truncate text-sm text-muted">{examples.join(", ") || "Empty"}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`map-${c}`}>Use column “{h}” as</label>
                <select
                  id={`map-${c}`}
                  value={mapping.byColumn[c] ?? ""}
                  onChange={(e) => setField(c, (e.target.value || null) as FieldKey | null)}
                  className="min-h-11 flex-1 rounded-lg border border-black/15 bg-white px-2 font-semibold sm:w-48 sm:flex-none"
                  data-testid={`map-${c}`}
                >
                  <option value="">Not used</option>
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABELS[f]}
                    </option>
                  ))}
                </select>
                {conf.text && !corrections.byColumn ? (
                  <span className={`w-14 rounded-[2px] px-2 py-0.5 text-center font-mono text-[11px] font-bold ${conf.cls}`} title={mapping.reasons[c]}>
                    {conf.text}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--ink)]"
          checked={result.hasHeader}
          onChange={(e) => onChange({ ...corrections, hasHeader: e.target.checked, byColumn: undefined, dateFormat: undefined })}
          data-testid="has-header"
        />
        First row is a header
      </label>

      {dateCol >= 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="datefmt" className="font-bold">Dates like 03/04/2026 mean</label>
          <select
            id="datefmt"
            value={mapping.dateFormat}
            onChange={(e) => onChange({ ...corrections, dateFormat: e.target.value as Corrections["dateFormat"] })}
            className="min-h-10 rounded-lg border border-black/15 bg-white px-2 font-semibold"
          >
            <option value="mdy">March 4 (month first)</option>
            <option value="dmy">3 April (day first)</option>
            <option value="ymd">Year first (2026-03-04)</option>
          </select>
          {mapping.dateFormatAmbiguous ? <span className="rounded-[2px] bg-sun px-2 py-0.5 font-mono text-[11px] font-bold">Please confirm</span> : null}
        </div>
      ) : null}

      {unknown.length ? (
        <>
          <h2 className="mt-10 text-xl font-extrabold">Unknown statuses</h2>
          <ul className="mt-3 space-y-2">
            {unknown.map((i) => {
              const raw = rows[i.rows[0]][mapping.byColumn.indexOf("status")] || "(blank)";
              return (
                <li key={i.statusKey} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
                  <span className="font-bold">“{raw}”</span>
                  <span className="text-sm text-muted">{i.rows.length} {i.rows.length === 1 ? "row" : "rows"}</span>
                  <select
                    aria-label={`What does “${raw}” mean?`}
                    className="ml-auto min-h-10 rounded-lg border border-black/15 bg-white px-2 font-semibold"
                    value={corrections.statusOverrides[i.statusKey!] ?? ""}
                    onChange={(e) => {
                      const o = { ...corrections.statusOverrides };
                      if (e.target.value) o[i.statusKey!] = e.target.value as Status;
                      else delete o[i.statusKey!];
                      onChange({ ...corrections, statusOverrides: o });
                    }}
                  >
                    <option value="">Leave out</option>
                    {STATUS_CHOICES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {otherIssues.length ? (
        <>
          <h2 className="mt-10 text-xl font-extrabold">Heads up</h2>
          <ul className="mt-3 space-y-2" data-testid="issues">
            {otherIssues.map((i, k) => (
              <li key={k} className={`rounded-xl border p-3 text-sm ${i.level === "warn" ? "border-ink bg-sun/40" : "border-line bg-white/50"}`}>
                {i.message}
                {i.kind !== "company_merged" && i.rows.length <= 12 ? (
                  <span className="text-muted"> Rows {i.rows.map((r) => r + (result.hasHeader ? 2 : 1)).join(", ")}.</span>
                ) : null}
              </li>
            ))}
          </ul>
          {dupes ? (
            <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--ink)]"
                checked={corrections.keepExactDuplicates}
                onChange={(e) => onChange({ ...corrections, keepExactDuplicates: e.target.checked })}
              />
              Count exact duplicates separately
            </label>
          ) : null}
        </>
      ) : null}

      {uncertainRows.length ? (
        <>
          <h2 className="mt-10 text-xl font-extrabold">Rows worth a look</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-black/10 bg-white text-sm">
            {uncertainRows.slice(0, 8).map((r) => (
              <li key={r} className="flex gap-3 p-3">
                <span className="w-16 shrink-0 text-muted">Row {r + (result.hasHeader ? 2 : 1)}</span>
                <span className="min-w-0">
                  {headers.map((h, c) =>
                    mapping.byColumn[c] && mapping.byColumn[c] !== "notes" ? (
                      <span key={c} className="mr-3 inline-block">
                        <span className="text-muted">{FIELD_LABELS[mapping.byColumn[c]!]}:</span> {rows[r][c] || "(empty)"}
                      </span>
                    ) : null,
                  )}
                </span>
              </li>
            ))}
          </ul>
          {uncertainRows.length > 8 ? <p className="mt-2 text-sm text-muted">…and {uncertainRows.length - 8} more.</p> : null}
        </>
      ) : null}

      <div className="mt-12 flex justify-end">
        <button type="button" className="mbtn mbtn-blue" onClick={onPlay} disabled={!hasCompany || count === 0 || busy}>
          Play my story
        </button>
      </div>
    </section>
  );
}
