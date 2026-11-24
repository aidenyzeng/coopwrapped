import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSummaryBody, validateSummary } from "@/lib/share/payload";
import { summaryFromMetrics } from "@/lib/share/card-data";
import { availableStats, defaultStatSelection } from "@/lib/share/stats";
import { captionSuggestions } from "@/lib/share/captions";
import { run, fixture } from "./helpers";

const fixtures = fs.readdirSync(path.join(__dirname, "../../fixtures")).filter((f) => /\.(csv|tsv)$/.test(f));

describe("public payload privacy", () => {
  it.each(fixtures)("%s: summary contains no spreadsheet strings", (f) => {
    const { result, metrics, persona } = run(fixture(f));
    const s = summaryFromMetrics(metrics, persona, defaultStatSelection(availableStats(metrics)), "comedy", 42);
    expect(validateSummary(s).ok).toBe(true);
    const json = JSON.stringify(s);
    for (const a of result.applications) {
      expect(json).not.toContain(a.company.value);
      if (a.role.value) expect(json).not.toContain(a.role.value);
    }
    expect(json.length).toBeLessThan(400);
  });

  const good = { v: 1, persona: "marathoner", personaParam: 80, total: 80, stats: [{ key: "companies", value: 50 }], style: "minimal", seed: 9 };
  it("accepts a valid summary", () => expect(validateSummary(good).ok).toBe(true));
  it.each([
    ["extra top-level field", { ...good, company: "Acme" }],
    ["extra stat field", { ...good, stats: [{ key: "companies", value: 3, name: "Acme" }] }],
    ["unknown stat key", { ...good, stats: [{ key: "top_company", value: 3 }] }],
    ["string value", { ...good, total: "80" }],
    ["float", { ...good, total: 8.5 }],
    ["negative", { ...good, total: -1 }],
    ["huge", { ...good, total: 10_000_000 }],
    ["bad persona", { ...good, persona: "<script>" }],
    ["bad version", { ...good, v: 2 }],
    ["too many stats", { ...good, stats: [1, 2, 3, 4].map(() => ({ key: "companies", value: 1 })) }],
    ["duplicate stat", { ...good, stats: [{ key: "companies", value: 1 }, { key: "companies", value: 2 }] }],
    ["denominator below value", { ...good, stats: [{ key: "responses", value: 5, of: 3 }] }],
    ["array", []],
    ["null", null],
  ])("rejects %s", (_n, input) => expect(validateSummary(input).ok).toBe(false));

  it("rejects oversized and malformed bodies", () => {
    expect(parseSummaryBody("{".repeat(5000)).ok).toBe(false);
    expect(parseSummaryBody("not json").ok).toBe(false);
  });

  it("captions never claim an offer that isn't recorded", () => {
    const { metrics, persona } = run(fixture("07-zero-offers.csv"));
    const s = summaryFromMetrics(metrics, persona, [], "achievement", 1);
    const c = captionSuggestions(s, "example.com");
    expect(JSON.stringify(c)).not.toMatch(/offer signed|signed offer|accepted|an offer on the table/i);
  });

  it("never offers a zero-offer stat", () => {
    const { metrics } = run(fixture("07-zero-offers.csv"));
    expect(availableStats(metrics).map((s) => s.key)).not.toContain("offers");
  });
});
