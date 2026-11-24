import { describe, expect, it } from "vitest";
import { sanitize, track, setAdapter, type TrackedEvent } from "@/lib/events/track";

describe("analytics events", () => {
  it("drops non-allowlisted props and values", () => {
    const out = sanitize("import_completed", {
      source: "paste",
      rows: "30-74",
      columns_corrected: false,
      warnings: 2,
      // @ts-expect-error — deliberately smuggling data
      company: "Northwind Labs",
    });
    expect(out).toEqual({ source: "paste", rows: "30-74", columns_corrected: false, warnings: 2 });
    // @ts-expect-error — wrong enum value
    expect(sanitize("export", { style: "Northwind", size: "story" })).toEqual({ size: "story" });
  });

  it("never throws even if the adapter fails", () => {
    setAdapter({ send: () => { throw new Error("boom"); } });
    expect(() => track("landing_cta", { position: "hero" })).not.toThrow();
    const got: TrackedEvent[] = [];
    setAdapter({ send: (e) => got.push(e) });
    track("share_link_created", { stats: 3 });
    expect(got[0]).toMatchObject({ name: "share_link_created", props: { stats: 3 } });
    setAdapter(null);
  });
});
