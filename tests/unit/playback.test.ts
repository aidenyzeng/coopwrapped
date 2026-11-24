import { describe, expect, it } from "vitest";
import { initPlayback, isPlaying, playbackReducer as r, slideProgress } from "@/lib/playback/machine";

const s0 = initPlayback([1000, 1000, Infinity]);

describe("playback state machine", () => {
  it("advances on time and stops at a wait-for-user slide", () => {
    let s = s0;
    for (let i = 0; i < 4; i++) s = r(s, { type: "TICK", ms: 200 });
    expect([s.index, s.elapsed]).toEqual([0, 800]);
    s = r(s, { type: "TICK", ms: 200 });
    expect([s.index, s.elapsed]).toEqual([1, 0]);
    for (let i = 0; i < 5; i++) s = r(s, { type: "TICK", ms: 200 });
    expect(s.index).toBe(2);
    expect(isPlaying(s)).toBe(false);
    expect(slideProgress(s)).toBe(1);
  });

  it("clamps huge ticks (background throttling) so slides are never skipped", () => {
    const s = r(s0, { type: "TICK", ms: 60_000 });
    expect(s.index).toBe(0);
    expect(s.elapsed).toBe(250);
  });

  it("pause reasons are independent", () => {
    let s = r(s0, { type: "PAUSE", reason: "hidden" });
    s = r(s, { type: "PAUSE", reason: "dialog" });
    s = r(s, { type: "RESUME", reason: "hidden" });
    expect(isPlaying(s)).toBe(false); // dialog still open
    expect(r(s, { type: "TICK", ms: 100 })).toBe(s);
    s = r(s, { type: "RESUME", reason: "dialog" });
    expect(isPlaying(s)).toBe(true);
  });

  it("navigation releases a hold but keeps an explicit pause", () => {
    let s = r(s0, { type: "PAUSE", reason: "hold" });
    s = r(s, { type: "TOGGLE_USER_PAUSE" });
    s = r(s, { type: "NEXT" });
    expect(s.index).toBe(1);
    expect(s.paused).toEqual(["user"]);
    expect(s.elapsed).toBe(0);
  });

  it("PREV on the first slide restarts it; NEXT on the last finishes", () => {
    let s = r({ ...s0, elapsed: 500 }, { type: "PREV" });
    expect([s.index, s.elapsed]).toEqual([0, 0]);
    s = r(r(r(s, { type: "NEXT" }), { type: "NEXT" }), { type: "NEXT" });
    expect(s.finished).toBe(true);
    expect(s.index).toBe(2);
  });

  it("each visit gets a new key for enter animations", () => {
    const s = r(r(s0, { type: "NEXT" }), { type: "PREV" });
    expect(s.visit).toBe(2);
  });
});
