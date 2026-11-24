"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { initPlayback, isPlaying, playbackReducer, slideProgress } from "@/lib/playback/machine";
import type { StoryPlan } from "@/lib/story/plan";
import { THEMES, siteHost } from "@/lib/design/tokens";
import { track } from "@/lib/events/track";
import { Slide } from "./Slide";
import { renderSlideBlob, shareOrDownload } from "../share/exporters";

const HOLD_MS = 220;
const SWIPE_PX = 45;

export interface StoryPlayerProps {
  plan: StoryPlan;
  mode: "own" | "sample" | "replay";
  /** content for summary/cta slides */
  renderEnd: (type: "summary" | "cta") => ReactNode;
  /** a dialog (share sheet) is open — playback pauses for it */
  dialogOpen: boolean;
  closeHref?: string;
  onClose?: () => void;
}

export function StoryPlayer({ plan, mode, renderEnd, dialogOpen, closeHref = "/", onClose }: StoryPlayerProps) {
  const reduced = useReducedMotion() ?? false;
  const durations = plan.slides.map((s) => s.durationMs);
  const [state, dispatch] = useReducer(playbackReducer, durations, initPlayback);
  const spec = plan.slides[state.index];
  const theme = THEMES[spec.theme];
  const completedRef = useRef(false);
  const [exporting, setExporting] = useState(false);

  // Reset when a new plan arrives (e.g. user went back and corrected mappings)
  const planKey = plan.slides.map((s) => s.id + s.variant).join("|") + plan.seed;
  useEffect(() => {
    dispatch({ type: "RESET", durations: plan.slides.map((s) => s.durationMs) });
    completedRef.current = false;
  }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock: rAF while playing. Large gaps (background throttling) are clamped by the machine.
  const playing = isPlaying(state);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      dispatch({ type: "TICK", ms: now - last });
      last = now;
      raf = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Environmental pauses
  useEffect(() => {
    const onVis = () => dispatch({ type: document.visibilityState === "hidden" ? "PAUSE" : "RESUME", reason: "hidden" });
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    dispatch({ type: dialogOpen || exporting ? "PAUSE" : "RESUME", reason: "dialog" });
  }, [dialogOpen, exporting]);

  // Story completion = reaching the final slide
  useEffect(() => {
    if (state.index === state.count - 1 && !completedRef.current) {
      completedRef.current = true;
      track("story_completed", { slides: state.count, mode });
    }
  }, [state.index, state.count, mode]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") dispatch({ type: "NEXT" });
      else if (e.key === "ArrowLeft") dispatch({ type: "PREV" });
      else if (e.key === " " || e.key === "k" || e.key === "K") {
        if (tag === "BUTTON" && e.key === " ") return; // let the focused button handle space
        e.preventDefault();
        dispatch({ type: "TOGGLE_USER_PAUSE" });
      } else if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, onClose]);

  // Pointer: tap = navigate, press-and-hold = pause, horizontal swipe = navigate
  const ptr = useRef<{ x: number; y: number; t: number; held: boolean; timer: number; id: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,textarea,select,label,canvas,[data-no-nav]")) return;
    if (e.button !== 0) return;
    const timer = window.setTimeout(() => {
      if (ptr.current) {
        ptr.current.held = true;
        dispatch({ type: "PAUSE", reason: "hold" });
      }
    }, HOLD_MS);
    ptr.current = { x: e.clientX, y: e.clientY, t: performance.now(), held: false, timer, id: e.pointerId };
  }, []);
  const endPointer = useCallback((e: React.PointerEvent, cancelled: boolean) => {
    const p = ptr.current;
    if (!p || p.id !== e.pointerId) return;
    window.clearTimeout(p.timer);
    ptr.current = null;
    if (p.held) {
      dispatch({ type: "RESUME", reason: "hold" });
      return;
    }
    if (cancelled) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      dispatch({ type: dx < 0 ? "NEXT" : "PREV" });
      return;
    }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dispatch({ type: e.clientX - rect.left < rect.width * 0.3 ? "PREV" : "NEXT" });
  }, []);

  const exportSlide = async () => {
    setExporting(true);
    try {
      const blob = await renderSlideBlob(spec, siteHost());
      const res = await shareOrDownload(blob, `coop-wrapped-${spec.id}.png`);
      track("export", { style: "slide", size: "story" });
      if (res !== "cancelled") track("share_action", { method: res, style: "slide" });
    } finally {
      setExporting(false);
    }
  };

  const userPaused = state.paused.includes("user");
  const iconBtn = "grid h-11 w-11 place-items-center rounded-full transition-colors";
  const iconStyle = { color: theme.fg, background: `color-mix(in srgb, ${theme.fg} 12%, transparent)` };
  const isEnd = spec.type === "summary" || spec.type === "cta";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink">
      <section
        aria-roledescription="story"
        aria-label="Your co-op recap"
        className="relative h-dvh w-full max-w-[min(100vw,calc(100dvh*9/16))] overflow-hidden sm:h-[min(100dvh,920px)] sm:max-w-[min(100vw,calc(min(100dvh,920px)*9/16))] sm:rounded-[22px] sm:shadow-2xl"
        style={{ containerType: "size" }}
      >
        <div
          className="no-select absolute inset-0 touch-pan-y"
          onPointerDown={onPointerDown}
          onPointerUp={(e) => endPointer(e, false)}
          onPointerCancel={(e) => endPointer(e, true)}
          onPointerLeave={(e) => ptr.current && endPointer(e, true)}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="story-surface"
        >
          <Slide key={`${spec.id}-${state.visit}`} spec={spec} still={reduced}>
            {isEnd ? renderEnd(spec.type as "summary" | "cta") : null}
          </Slide>
        </div>

        {/* progress */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex gap-[5px] px-3 pt-3" aria-hidden>
          {plan.slides.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${theme.fg} 28%, transparent)` }}>
              <div
                className="h-full origin-left rounded-full"
                style={{
                  background: theme.fg,
                  transform: `scaleX(${i < state.index ? 1 : i > state.index ? 0 : slideProgress(state)})`,
                }}
              />
            </div>
          ))}
        </div>

        {/* controls */}
        <div className="absolute inset-x-0 top-5 flex items-center justify-between px-3">
          <span className="text-sm font-bold tracking-tight" style={{ color: theme.fg }}>
            Co-op Wrapped
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={iconBtn} style={iconStyle} onClick={exportSlide} aria-label="Export this slide as an image" title="Export slide">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
            </button>
            <button
              type="button"
              className={iconBtn}
              style={iconStyle}
              onClick={() => dispatch({ type: "TOGGLE_USER_PAUSE" })}
              aria-label={userPaused ? "Play story" : "Pause story"}
              aria-pressed={userPaused}
              data-testid="pause-toggle"
            >
              {userPaused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4l13 8-13 8z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              )}
            </button>
            {onClose ? (
              <button type="button" className={iconBtn} style={iconStyle} onClick={onClose} aria-label="Close story">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
              </button>
            ) : (
              <Link href={closeHref} className={iconBtn} style={iconStyle} aria-label="Close story">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
              </Link>
            )}
          </div>
        </div>

        {/* explicit prev/next for keyboard & screen-reader users (visible on focus / desktop) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-between px-3">
          <button
            type="button"
            className="sr-only-focusable pointer-events-auto rounded-full px-4 py-2 text-sm font-bold"
            style={iconStyle}
            onClick={() => dispatch({ type: "PREV" })}
            disabled={state.index === 0}
          >
            Previous slide
          </button>
          <button
            type="button"
            className="sr-only-focusable pointer-events-auto rounded-full px-4 py-2 text-sm font-bold"
            style={iconStyle}
            onClick={() => dispatch({ type: "NEXT" })}
          >
            Next slide
          </button>
        </div>

        <p className="sr-only" aria-live="polite" data-testid="slide-status">
          Slide {state.index + 1} of {state.count}: {spec.content.eyebrow}. {spec.content.hero ? `${spec.content.hero} ${spec.content.heroLabel ?? ""}.` : ""} {spec.content.headline} {spec.content.body ?? ""}
          {userPaused ? " Paused." : ""}
        </p>
      </section>

      {/* desktop side arrows */}
      <button
        type="button"
        onClick={() => dispatch({ type: "PREV" })}
        className="absolute left-6 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-paper/10 text-paper hover:bg-paper/20 md:grid"
        aria-label="Previous slide"
        disabled={state.index === 0}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "NEXT" })}
        className="absolute right-6 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-paper/10 text-paper hover:bg-paper/20 md:grid"
        aria-label="Next slide"
      >
        ›
      </button>
      <span className="sr-only" data-testid="slide-index">{state.index}</span>
    </div>
  );
}
