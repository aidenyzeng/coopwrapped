"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateFormat, FieldKey, ImportResult, Status } from "@/lib/model/types";
import { MAX_INPUT, runImport } from "@/lib/import/run";
import { analyzeResult, today, type Analysis } from "@/lib/pipeline";
import { getReferral, rowsBucket, track } from "@/lib/events/track";
import { SAMPLES, SAMPLE_IDS } from "@/lib/samples/data";
import { ReviewStep } from "./ReviewStep";
import { StoryExperience } from "../story/StoryExperience";

type Stage = "input" | "review" | "story";
type Source = "paste" | "file";

export interface Corrections {
  byColumn?: (FieldKey | null)[];
  dateFormat?: DateFormat;
  statusOverrides: Record<string, Status>;
  keepExactDuplicates: boolean;
  hasHeader?: boolean;
}

export function MakeFlow() {
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source>("paste");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [corr, setCorr] = useState<Corrections>({ statusOverrides: {}, keepExactDuplicates: false });
  const [busy, setBusy] = useState(false);
  const ref = useMemo(() => today(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const corrected = corr.byColumn !== undefined || corr.dateFormat !== undefined || corr.hasHeader !== undefined || Object.keys(corr.statusOverrides).length > 0;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("via") === "replay" || getReferral()) track("replay_create_start", { via: "make_your_own" });
  }, []);

  const process = useCallback(
    async (input: string, src: Source, c: Corrections) => {
      setError("");
      if (!input.trim()) {
        setError("Paste a few rows (with headers if you have them) or upload a CSV.");
        track("import_failed", { source: src, reason: "empty" });
        return;
      }
      if (input.length > MAX_INPUT) {
        setError("That’s more than 5 MB of text — try exporting just the applications tab.");
        track("import_failed", { source: src, reason: "too_large" });
        return;
      }
      setBusy(true);
      try {
        const r = await runImport(input, {
          referenceDate: ref,
          mapping: c.byColumn || c.dateFormat ? { byColumn: c.byColumn, dateFormat: c.dateFormat } : undefined,
          statusOverrides: c.statusOverrides,
          keepExactDuplicates: c.keepExactDuplicates,
          hasHeader: c.hasHeader,
        });
        setResult(r);
        setStage("review");
      } catch {
        setError("We couldn’t read that. Try copying the cells straight from your spreadsheet, or export a CSV.");
        track("import_failed", { source: src, reason: "parse_error" });
      } finally {
        setBusy(false);
      }
    },
    [ref],
  );

  const updateCorrections = (next: Corrections) => {
    setCorr(next);
    void process(text, source, next);
  };

  const analysis: Analysis | null = useMemo(
    () => (result && result.applications.length > 0 ? analyzeResult(result, ref) : null),
    [result, ref],
  );

  const play = () => {
    if (!result || !analysis) return;
    if (!result.mapping.byColumn.includes("company")) {
      track("import_failed", { source, reason: "no_company" });
      return;
    }
    track("import_completed", {
      source,
      rows: rowsBucket(result.applications.length),
      columns_corrected: corrected,
      warnings: result.issues.filter((i) => i.level === "warn").length,
    });
    setStage("story");
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_INPUT) {
      setError("That file is over 5 MB — try exporting just the applications sheet as CSV.");
      track("import_failed", { source: "file", reason: "too_large" });
      return;
    }
    if (/\.(xlsx|xls|numbers)$/i.test(f.name)) {
      setError("That’s a spreadsheet file, not a CSV. Export as CSV, or just copy the cells and paste them here.");
      track("import_failed", { source: "file", reason: "parse_error" });
      return;
    }
    const t = await f.text();
    setText(t);
    setSource("file");
    const fresh = { statusOverrides: {}, keepExactDuplicates: false };
    setCorr(fresh);
    void process(t, "file", fresh);
  };

  if (stage === "story" && analysis) {
    return (
      <StoryExperience
        metrics={analysis.metrics}
        persona={analysis.persona}
        seed={analysis.seed}
        topCompany={analysis.topCompany}
        mode="own"
        onClose={() => setStage("review")}
      />
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          Co-op Wrapped
        </Link>
        <span className="flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1 text-xs font-bold">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          Stays in your browser
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {stage === "input" || !result ? (
          <section aria-labelledby="input-title" className="mx-auto max-w-2xl pt-6">
            <h1 id="input-title" className="text-[clamp(2.4rem,8vw,4.2rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">
              Paste your <span className="font-serif-i font-normal">tracker.</span>
            </h1>
            <p className="mt-4 text-lg">
              Select the cells in Google Sheets, Excel or Numbers — header row included — copy, and paste below. Only a company column is required.
            </p>

            <label htmlFor="paste" className="mt-8 block text-xs font-bold uppercase tracking-[0.14em]">
              Your applications
            </label>
            <textarea
              id="paste"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSource("paste");
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (!text.trim() && pasted.trim()) {
                  e.preventDefault();
                  setText(pasted);
                  setSource("paste");
                  const fresh = { statusOverrides: {}, keepExactDuplicates: false };
                  setCorr(fresh);
                  void process(pasted, "paste", fresh);
                }
              }}
              rows={9}
              spellCheck={false}
              placeholder={"Company · Role · Date applied · Status\nNorthwind Labs · Dev Co-op · Jan 12 · Interviewing\nMaple Byte · Data Intern · Jan 14 · Applied\n…paste your rows here"}
              className="mt-2 w-full rounded-2xl border-[2.5px] border-ink bg-white/70 p-4 font-mono text-sm leading-relaxed shadow-[4px_4px_0_var(--ink)] placeholder:text-muted/70"
              aria-describedby="paste-help privacy-note"
              data-testid="paste-input"
            />
            <p id="paste-help" className="mt-2 text-sm text-muted">
              Messy is fine: we detect columns, normalize statuses like “rejected 😭”, and show you everything before the story starts.
            </p>
            {error ? (
              <p role="alert" className="mt-3 rounded-xl border-2 border-tomato bg-tomato/10 p-3 text-sm font-semibold">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={() => process(text, source, corr)} disabled={busy} data-testid="continue">
                {busy ? "Reading…" : "Continue"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                Upload CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="file-input" aria-label="Upload a CSV file" />
            </div>

            <div className="mt-10 rounded-2xl border-2 border-dashed border-ink/40 p-4">
              <p className="text-sm font-bold">No spreadsheet handy? Try a sample:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SAMPLE_IDS.map((id) => (
                  <Link key={id} href={`/sample/${id}?via=make`} className="rounded-full border-2 border-ink px-3.5 py-2 text-sm font-bold hover:bg-ink hover:text-paper">
                    {SAMPLES[id].label} <span className="font-normal opacity-75">· {SAMPLES[id].blurb}</span>
                  </Link>
                ))}
              </div>
            </div>

            <p id="privacy-note" className="mt-8 text-sm text-muted">
              Your spreadsheet is read and analyzed in this browser tab. It isn’t uploaded, saved, or sent to analytics. Close the tab and it’s gone. Only if you later choose “Create share link” do a few summary numbers leave your device — and you’ll see exactly which.
            </p>
          </section>
        ) : (
          <ReviewStep
            result={result}
            analysis={analysis}
            corrections={corr}
            onChange={updateCorrections}
            onBack={() => setStage("input")}
            onPlay={play}
            busy={busy}
          />
        )}
      </main>
    </div>
  );
}
