import { describe, expect, it } from "vitest";
import { PERSONAS, selectPersona } from "@/lib/persona/personas";
import { computeMetrics, type Metrics } from "@/lib/analytics/metrics";
import { SAMPLES, SAMPLE_IDS } from "@/lib/samples/data";
import { run, fixture } from "./helpers";

function m(over: Partial<Metrics>): Metrics {
  const base = computeMetrics([], "2026-11-24", { hasStatusColumn: true });
  return { ...base, total: 40, companies: 30, smallSample: false, ...over } as Metrics;
}

describe("persona rules", () => {
  it("is deterministic", () => {
    const a = run(fixture("07-zero-offers.csv")).persona;
    const b = run(fixture("07-zero-offers.csv")).persona;
    expect(a).toEqual(b);
  });

  it("checks rules in priority order (accepted beats volume)", () => {
    const p = selectPersona(m({ total: 200, offers: { total: 1, accepted: 1, source: "status" } }));
    expect(p.id).toBe("closer");
    expect(p.why.skipped).toHaveLength(0);
  });

  it("small samples get the cautious persona unless an offer is recorded", () => {
    expect(selectPersona(m({ total: 4, companies: 4 })).id).toBe("first_move");
    expect(selectPersona(m({ total: 4, offers: { total: 1, accepted: 0, source: "status" } })).id).toBe("contender");
  });

  it("does not hand out rate-based personas on tiny denominators", () => {
    // 3 of 4 responded is 75%, but statusKnown < 8 → no Sharpshooter
    const p = selectPersona(m({ total: 9, statusKnown: 4, responded: 3 }));
    expect(p.id).not.toBe("sharpshooter");
  });

  it("supporting sentence is tied to real stats", () => {
    const { persona, metrics } = run(fixture("08-mostly-unanswered.csv"));
    expect(persona.sentence).toContain(String(metrics.total));
  });

  it("every persona is reachable and has a supportive sentence without zero-shaming", () => {
    for (const p of PERSONAS) {
      const s = p.sentence(3, 40);
      expect(s.length).toBeGreaterThan(10);
      expect(s).not.toMatch(/only|just|failed|failure|lazy|0%/i);
    }
  });

  it("sample datasets produce the persona they are labeled with", () => {
    for (const id of SAMPLE_IDS) {
      const { persona } = run(SAMPLES[id].text);
      expect(persona.id).toBe(id);
      expect(persona.name).toBe(SAMPLES[id].label);
    }
  });
});
