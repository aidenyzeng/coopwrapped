import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { planStory, planReplay } from "@/lib/story/plan";
import { metricsSeed } from "@/lib/analytics/metrics";
import { run, fixture, csv } from "./helpers";

const all = fs.readdirSync(path.join(__dirname, "../../fixtures")).filter((f) => /\.(csv|tsv)$/.test(f));

function plan(text: string) {
  const { metrics, persona } = run(text);
  return { metrics, p: planStory({ metrics, persona, seed: metricsSeed(metrics) }) };
}

describe("story planning", () => {
  it.each(all)("%s: 5–8 slides, no empty or NaN content", (f) => {
    const { p } = plan(fixture(f));
    expect(p.slides.length).toBeGreaterThanOrEqual(5);
    expect(p.slides.length).toBeLessThanOrEqual(8);
    const text = JSON.stringify(p.slides.map((s) => s.content));
    expect(text).not.toMatch(/NaN|undefined|Infinity|null applications/);
    for (const s of p.slides) expect(s.content.headline.trim().length).toBeGreaterThan(0);
    expect(p.slides[0].type).toBe("intro");
    expect(p.slides.at(-1)!.type).toBe("summary");
    // consecutive slides never share a background
    for (let i = 1; i < p.slides.length; i++) expect(p.slides[i].theme).not.toBe(p.slides[i - 1].theme);
  });

  it("omits the rhythm slide without enough dates", () => {
    expect(plan(fixture("05-tiny.csv")).p.slides.map((s) => s.type)).not.toContain("rhythm");
  });

  it("omits outcomes without a status column", () => {
    const { p } = plan(csv([["Company", "Date"], ...Array.from({ length: 12 }, (_, i) => [`C${i}`, `2026-01-${10 + i}`])]));
    expect(p.slides.map((s) => s.type)).not.toContain("outcomes");
  });

  it("only celebrates when an offer is recorded", () => {
    expect(plan(fixture("07-zero-offers.csv")).p.slides.find((s) => s.type === "ending")?.variant).toBe("ongoing");
    expect(plan(fixture("06-large-300.csv")).p.slides.find((s) => s.type === "ending")?.variant).toBe("accepted");
    expect(plan(fixture("10-milestones.tsv")).p.slides.find((s) => s.type === "ending")?.variant).toBe("offer");
  });

  it("mostly-unanswered data gets supportive outcome copy and no 'ghosted' wording", () => {
    const { p } = plan(fixture("08-mostly-unanswered.csv"));
    const outcomes = p.slides.find((s) => s.type === "outcomes")!;
    expect(outcomes.variant).toBe("quiet");
    expect(JSON.stringify(p)).not.toMatch(/ghost/i);
  });

  it("outcome slide shows denominators", () => {
    const { p, metrics } = plan(fixture("07-zero-offers.csv"));
    const o = p.slides.find((s) => s.type === "outcomes")!;
    expect(o.content.heroLabel).toContain(`of ${metrics.statusKnown}`);
    const viz = o.content.viz;
    expect(viz?.kind === "outcomes" && viz.denominator).toBe(metrics.statusKnown);
  });

  it("is deterministic and every slide has required metadata", () => {
    const a = plan(fixture("01-messy-headers.tsv")).p;
    const b = plan(fixture("01-messy-headers.tsv")).p;
    expect(a).toEqual(b);
    for (const s of a.slides) {
      expect(s.requires.length).toBeGreaterThan(0);
      expect(s.variant).toBeTruthy();
      expect(s.durationMs).toBeGreaterThan(0);
      expect(Number.isInteger(s.seed)).toBe(true);
    }
  });

  it("company names appear only when explicitly enabled", () => {
    const { metrics, persona } = run(fixture("04-duplicates.csv"));
    const off = planStory({ metrics, persona, seed: 1, topCompany: "Shopwise" });
    const on = planStory({ metrics, persona, seed: 1, topCompany: "Shopwise", showCompanyNames: true });
    expect(JSON.stringify(off)).not.toContain("Shopwise");
    expect(JSON.stringify(on)).toContain("Shopwise");
  });

  it("replay plan ends with a call to action", () => {
    const r = planReplay({ v: 1, persona: "builder", personaParam: 10, total: 20, stats: [], style: "minimal", seed: 3 });
    expect(r.slides.at(-1)!.type).toBe("cta");
    expect(r.slides.map((s) => s.type)).not.toContain("highlights");
  });
});
