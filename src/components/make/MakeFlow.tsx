"use client";

import Link from "next/link";
import { SiteHeader } from "../SiteHeader";
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

/** Confident enough to skip the review screen: company found for sure, nothing to confirm. */
function isClean(r: ImportResult) {
  const companyCol = r.mapping.byColumn.indexOf("company");
  return (
    r.applications.length > 0 &&
    companyCol >= 0 &&
    r.mapping.confidence[companyCol] >= 0.8 &&
    r.mapping.byColumn.every((f, i) => !f || r.mapping.confidence[i] >= 0.5) &&
    !r.mapping.dateFormatAmbiguous &&
    !r.issues.some((i) => i.level === "warn" || i.kind === "unknown_status")
  );
}

function trackCompleted(r: ImportResult, source: Source, corrected: boolean) {
  track("import_completed", {
    source,
    rows: rowsBucket(r.applications.length),
    columns_corrected: corrected,
    warnings: r.issues.filter((i) => i.level === "warn").length,
  });
}

export function MakeFlow() {
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source>("paste");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [corr, setCorr] = useState<Corrections>({ statusOverrides: {}, keepExactDuplicates: false });
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ref = useMemo(() => today(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const corrected = corr.byColumn !== undefined || corr.dateFormat !== undefined || corr.hasHeader !== undefined || Object.keys(corr.statusOverrides).length > 0;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("via") === "replay" || getReferral()) track("replay_create_start", { via: "make_your_own" });
  }, []);

  const process = useCallback(
    async (input: string, src: Source, c: Corrections, fresh = false) => {
      setError("");
      if (!input.trim()) {
        setError("Paste a few rows first, or upload a CSV.");
        track("import_failed", { source: src, reason: "empty" });
        return;
      }
      if (input.length > MAX_INPUT) {
        setError("That’s over 5 MB. Try copying just the applications tab.");
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
        // A clean import goes straight to the story; anything uncertain stops at the quick check.
        // Closing the story always lands on the check, so columns can still be fixed.
        if (fresh && isClean(r)) {
          trackCompleted(r, src, false);
          setStage("story");
        } else setStage("review");
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
    trackCompleted(result, source, corrected);
    setStage("story");
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_INPUT) {
      setError("That file is over 5 MB. Try exporting just the applications sheet.");
      track("import_failed", { source: "file", reason: "too_large" });
      return;
    }
    if (/\.(xlsx|xls|numbers)$/i.test(f.name)) {
      setError("That’s a spreadsheet file. Copy the cells and paste them here, or export a CSV.");
      track("import_failed", { source: "file", reason: "parse_error" });
      return;
    }
    const t = await f.text();
    setText(t);
    setSource("file");
    const fresh = { statusOverrides: {}, keepExactDuplicates: false };
    setCorr(fresh);
    void process(t, "file", fresh, true);
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
    <div className="min-h-dvh bg-[#fbfbfa]">
      <SiteHeader
        right={
          <span className="flex items-center gap-1.5 text-[14px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            Stays in your browser
          </span>
        }
      />

      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {stage === "input" || !result ? (
          <section aria-labelledby="input-title" className="mx-auto max-w-2xl pt-6 sm:pt-12">
            <h1 id="input-title" className="font-pixel text-[clamp(2.4rem,8vw,4rem)] leading-[1]">
              Paste your tracker
            </h1>
            <p className="mt-3 text-lg text-muted">Copy your rows from Sheets or Excel and paste them here.</p>

            <label htmlFor="paste" className="sr-only">
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
                  void process(pasted, "paste", fresh, true);
                }
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setDragging(true);
                }
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                const f = e.dataTransfer.files?.[0];
                setDragging(false);
                if (f) {
                  e.preventDefault();
                  void onFile(f);
                }
              }}
              rows={8}
              spellCheck={false}
              placeholder="Paste here, or drop a CSV"
              className={`mt-6 w-full rounded-2xl border bg-white p-4 font-mono text-sm leading-relaxed shadow-[0_10px_30px_-20px_rgb(0_0_0/0.4)] transition-colors placeholder:text-muted/70 ${dragging ? "border-ink border-dashed bg-[#f4f3ef]" : "border-black/10"}`}
              data-testid="paste-input"
            />
            {error ? (
              <p role="alert" className="mt-3 rounded-xl border border-tomato bg-tomato/10 p-3 text-sm font-semibold">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="mbtn mbtn-ink" onClick={() => process(text, source, corr, true)} disabled={busy} data-testid="continue">
                {busy ? "Reading…" : "Make my story"}
              </button>
              <button type="button" className="mbtn mbtn-ghost" onClick={() => fileRef.current?.click()}>
                Upload CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="file-input" aria-label="Upload a CSV file" />
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-muted">No sheet? Try one:</span>
              {SAMPLE_IDS.map((id) => (
                <Link key={id} href={`/sample/${id}?via=make`} title={SAMPLES[id].blurb} className="press rounded-full border border-black/15 px-3.5 py-2 text-[14px] font-semibold hover:bg-ink hover:text-white">
                  {SAMPLES[id].label}
                </Link>
              ))}
            </div>
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
