import { importText, type ImportOptions } from "./import/build";
import { analyze, metricsSeed, type Metrics } from "./analytics/metrics";
import { selectPersona, type PersonaResult } from "./persona/personas";
import { topCompany } from "./analytics/local";
import type { ImportResult } from "./model/types";

export interface Analysis {
  result: ImportResult;
  metrics: Metrics;
  persona: PersonaResult;
  seed: number;
  topCompany?: { name: string; count: number };
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function analyzeResult(result: ImportResult, referenceDate: string): Analysis {
  const metrics = analyze(result, referenceDate);
  return { result, metrics, persona: selectPersona(metrics), seed: metricsSeed(metrics), topCompany: topCompany(result.applications) };
}

export function runPipeline(text: string, opts: ImportOptions): Analysis {
  return analyzeResult(importText(text, opts), opts.referenceDate);
}
