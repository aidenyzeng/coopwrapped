import type { PublicSummaryV1 } from "../share/payload";
import { SAMPLES, type SampleId } from "./data";
import { importText } from "../import/build";
import { analyze, metricsSeed } from "../analytics/metrics";
import { selectPersona } from "../persona/personas";
import { summaryFromMetrics } from "../share/card-data";
import { availableStats, defaultStatSelection } from "../share/stats";
import type { CardStyle } from "../share/payload";

/** Sample summaries are computed from the sample spreadsheets, never hand-written. */
export function sampleSummary(id: SampleId, style: CardStyle = "achievement", referenceDate = "2026-11-24"): PublicSummaryV1 {
  const res = importText(SAMPLES[id].text, { referenceDate });
  const m = analyze(res, referenceDate);
  const persona = selectPersona(m);
  return summaryFromMetrics(m, persona, defaultStatSelection(availableStats(m)), style, metricsSeed(m));
}

export const SAMPLE_SUMMARY: PublicSummaryV1 = sampleSummary("marathoner");
