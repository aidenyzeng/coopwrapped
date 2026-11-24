import { describe, expect, it } from "vitest";
import { run, csv, fixture } from "./helpers";

describe("metric semantics", () => {
  it("does not claim interview history from current status alone", () => {
    const { metrics } = run(csv([["Company", "Status"], ["A", "Rejected"], ["B", "Interviewing"], ["C", "Applied"]]));
    expect(metrics.interviews.source).toBe("current");
    expect(metrics.interviews.current).toBe(1);
  });

  it("uses history when an interview column exists, and rejected-with-interview counts", () => {
    const { metrics } = run(csv([["Company", "Status", "Interviewed?"], ["A", "Rejected", "yes"], ["B", "Rejected", "no"], ["C", "Applied", ""]]));
    expect(metrics.interviews).toMatchObject({ source: "history", recorded: 1 });
  });

  it("accepted implies an offer but not a recorded interview", () => {
    const { metrics, result } = run(csv([["Company", "Status"], ["A", "Accepted"], ["B", "Rejected"]]));
    expect(metrics.offers).toMatchObject({ total: 1, accepted: 1 });
    expect(result.applications[0].interviewed.value).not.toBe(true);
    expect(metrics.interviews.recorded).toBe(0);
  });

  it("counts offer-declined as an offer", () => {
    expect(run(csv([["Company", "Status"], ["A", "Offer declined"]])).metrics.offers.total).toBe(1);
  });

  it("never labels recent pending applications as aged / unanswered", () => {
    const { metrics } = run(csv([["Company", "Status", "Date"], ["A", "Applied", "2026-11-20"], ["B", "Applied", "2026-10-01"], ["C", "Rejected", "2026-09-01"]]));
    expect(metrics.waiting).toBe(2);
    expect(metrics.waitingAged).toBe(1); // only the one 30+ days old
  });

  it("waitingAged is null without dates (unknown, not zero)", () => {
    expect(run(csv([["Company", "Status"], ["A", "Applied"]])).metrics.waitingAged).toBeNull();
  });

  it("keeps unknown and blank statuses out of response denominators", () => {
    const { metrics } = run(csv([["Company", "Status"], ["A", "Rejected"], ["B", "maybe"], ["C", ""], ["D", "Applied"]]));
    expect(metrics.statusKnown).toBe(2);
    expect(metrics.statusBlank).toBe(1);
    expect(metrics.statusCounts.unknown).toBe(1);
    expect(metrics.responded).toBe(1);
  });

  it("requires enough dates before computing rhythm", () => {
    const { metrics } = run(fixture("02-missing-dates.csv"));
    expect(metrics.dates?.dated).toBe(20);
    const tiny = run(csv([["Company", "Date"], ["A", "2026-01-01"], ["B", ""], ["C", ""], ["D", ""], ["E", ""], ["F", "2026-01-02"]]));
    expect(tiny.metrics.dates).toBeNull();
  });

  it("computes busiest week, streak and 7-day burst correctly", () => {
    const rows = [["Company", "Date"], ...["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-07", "2026-01-20", "2026-01-21"].map((d, i) => [`C${i}`, d])];
    const d = run(csv(rows)).metrics.dates!;
    expect(d.busiestWeek).toEqual({ start: "2026-01-05", count: 4 });
    expect(d.longestStreak).toBe(3);
    expect(d.maxIn7Days).toBe(4);
    expect(d.weekdayCounts[0]).toBe(1); // Monday Jan 5
  });

  it("never produces NaN for empty or tiny inputs", () => {
    const { metrics } = run(csv([["Company"], ["A"]]));
    const json = JSON.stringify(metrics);
    expect(json).not.toMatch(/NaN|Infinity|null,"burstShare/);
  });
});
