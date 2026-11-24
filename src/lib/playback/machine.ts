/**
 * Story playback as an explicit, pure state machine.
 *
 * Pausing is modelled as a SET of reasons (user, hold, hidden, dialog). Playback
 * advances only when the set is empty, so overlapping causes — e.g. the tab is
 * hidden while the export dialog is open — can't resume each other by accident.
 * Time only advances through TICK events carrying elapsed ms, which makes the
 * machine deterministic and trivially testable.
 */

export type PauseReason = "user" | "hold" | "hidden" | "dialog";

export interface PlaybackState {
  index: number;
  count: number;
  /** ms elapsed within the current slide */
  elapsed: number;
  durations: number[]; // Infinity = wait for the user
  paused: PauseReason[];
  finished: boolean; // reached the end of the last slide
  /** monotonically increasing; lets the view key enter animations per visit */
  visit: number;
}

export type PlaybackEvent =
  | { type: "TICK"; ms: number }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "GOTO"; index: number }
  | { type: "PAUSE"; reason: PauseReason }
  | { type: "RESUME"; reason: PauseReason }
  | { type: "TOGGLE_USER_PAUSE" }
  | { type: "RESET"; durations: number[] };

export function initPlayback(durations: number[]): PlaybackState {
  return { index: 0, count: durations.length, elapsed: 0, durations, paused: [], finished: false, visit: 0 };
}

export const isPlaying = (s: PlaybackState) => s.paused.length === 0 && !s.finished && Number.isFinite(s.durations[s.index]);

/** 0..1 progress of the current slide (1 for slides that wait for the user once visited) */
export function slideProgress(s: PlaybackState): number {
  const d = s.durations[s.index];
  if (!Number.isFinite(d)) return 1;
  return Math.min(1, s.elapsed / d);
}

function go(s: PlaybackState, index: number): PlaybackState {
  const i = Math.max(0, Math.min(s.count - 1, index));
  // Navigation clears gesture-type pauses but keeps an explicit user pause and
  // environmental pauses (hidden tab, open dialog).
  return { ...s, index: i, elapsed: 0, finished: false, visit: s.visit + 1, paused: s.paused.filter((r) => r !== "hold") };
}

export function playbackReducer(s: PlaybackState, e: PlaybackEvent): PlaybackState {
  switch (e.type) {
    case "TICK": {
      if (!isPlaying(s) || e.ms <= 0) return s;
      // Clamp large gaps (e.g. a throttled timer) so we never skip slides.
      const elapsed = s.elapsed + Math.min(e.ms, 250);
      const d = s.durations[s.index];
      if (elapsed < d) return { ...s, elapsed };
      if (s.index >= s.count - 1) return { ...s, elapsed: d, finished: true };
      return { ...go(s, s.index + 1) };
    }
    case "NEXT":
      if (s.index >= s.count - 1) return { ...s, elapsed: s.durations[s.index], finished: true };
      return go(s, s.index + 1);
    case "PREV":
      // Predictable beats clever: PREV always goes to the previous slide
      // (on the first slide it restarts it).
      return go(s, s.index - 1);
    case "GOTO":
      return go(s, e.index);
    case "PAUSE":
      return s.paused.includes(e.reason) ? s : { ...s, paused: [...s.paused, e.reason] };
    case "RESUME":
      return s.paused.includes(e.reason) ? { ...s, paused: s.paused.filter((r) => r !== e.reason) } : s;
    case "TOGGLE_USER_PAUSE":
      return s.paused.includes("user")
        ? { ...s, paused: s.paused.filter((r) => r !== "user") }
        : { ...s, paused: [...s.paused, "user"] };
    case "RESET":
      return initPlayback(e.durations);
  }
}
