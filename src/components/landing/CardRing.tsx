"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, ViewTransition } from "react";
import { track } from "@/lib/events/track";

export interface RingItem {
  src: string;
  href: string;
  title: string;
  subtitle: string;
  alt: string;
  sample: "marathoner" | "closer" | "optimist";
  /** wordmark tint while this card is at the front (portfolios.here-style colour pick) */
  pick: [string, string, string];
}

const SPEED = 7; // degrees per second
const HOVER_RATE = 0.25; // hovering slows the ring to a quarter speed (it never stops)
const PANELS = 18; // 20° apart, two full cycles of the 9 sample cards: a full-width curved band

/**
 * A slowly turning 3D ring of sample cards (CSS 3D, no WebGL).
 *
 * Hovering slows the ring to a quarter speed rather than stopping it.
 * Idle rotation is a Web Animation on the ring's transform, so the compositor turns
 * it with no main-thread work per frame. JS takes over only while the user drags,
 * flicks or picks a card, then hands rotation back to the compositor.
 * The caption polls the angle a few times a second instead of every frame.
 */
export function CardRing({ items }: { items: RingItem[] }) {
  const all = Array.from({ length: PANELS }, (_, i) => items[i % items.length]);
  const n = all.length;
  const step = 360 / n;

  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0); // angle while JS drives (or when auto stopped)
  const anim = useRef<Animation | null>(null);
  const autoFrom = useRef(0);
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const drag = useRef<{ x: number; a: number; t: number; moved: number } | null>(null);
  const loopRaf = useRef(0);
  const hover = useRef(false);
  const justDragged = useRef(false);
  // index of the panel currently at the front (0..n-1); the caption uses its item
  const [frontPanel, setFrontPanel] = useState(0);
  const frontRef = useRef(0);
  const [reduced, setReduced] = useState(false);
  // Only the three cards facing the viewer load with the page; the rest wait for idle
  // time so they never compete with the front card (the LCP element) for bandwidth.
  const [restReady, setRestReady] = useState(false);
  useEffect(() => {
    const go = () => setRestReady(true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (document.readyState === "complete") {
      if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 1200 });
      else setTimeout(go, 300);
    } else window.addEventListener("load", () => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 1200 }) : setTimeout(go, 300)), { once: true });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // geometry (card width, ring radius, perspective) is pure CSS (see .ring-stage in globals.css),
  // so the ring paints from server HTML before hydration; JS only rotates.
  const T = useCallback((a: number) => `rotateY(${-a}deg)`, []);
  const cardWidth = () => (ringRef.current?.firstElementChild as HTMLElement | null)?.offsetWidth || 400;

  const currentAngle = useCallback(() => {
    const a = anim.current;
    if (a && a.currentTime !== null) return autoFrom.current + ((Number(a.currentTime) / 1000) * SPEED);
    return angle.current;
  }, []);

  const updateFront = useCallback(
    (ang: number) => {
      const panel = ((Math.round(ang / step) % n) + n) % n;
      if (panel !== frontRef.current) {
        frontRef.current = panel;
        setFrontPanel(panel);
        // tint the wordmark with the front card's colours (CSS @property animates the change)
        const pick = items[panel % items.length].pick;
        const root = document.documentElement.style;
        pick.forEach((c, k) => root.setProperty(`--pick-${k + 1}`, c));
      }
    },
    [step, n, items],
  );

  const stopAuto = useCallback(() => {
    angle.current = currentAngle();
    anim.current?.cancel();
    anim.current = null;
    if (ringRef.current) ringRef.current.style.transform = T(angle.current);
  }, [currentAngle, T]);

  const startAuto = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) return;
    ring.style.transform = T(angle.current);
    if (reduced) return;
    autoFrom.current = angle.current;
    anim.current = ring.animate([{ transform: T(angle.current) }, { transform: T(angle.current + 360) }], {
      duration: (360 / SPEED) * 1000,
      iterations: Infinity,
      easing: "linear",
    });
    if (hover.current) anim.current.playbackRate = HOVER_RATE;
  }, [T, reduced]);

  // Ease the playback rate (the ring keeps turning, just slower while hovered).
  // currentAngle() reads animation time, so it stays correct at any rate.
  const rateRaf = useRef(0);
  const easeRate = useCallback((target: number) => {
    cancelAnimationFrame(rateRaf.current);
    const a = anim.current;
    if (!a) return;
    const from = a.playbackRate;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 450);
      const e = 1 - Math.pow(1 - k, 3); // ease-out
      if (anim.current) anim.current.playbackRate = from + (target - from) * e;
      if (k < 1) rateRaf.current = requestAnimationFrame(step);
    };
    rateRaf.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(rateRaf.current), []);

  // (re)start the compositor rotation when size or motion preference changes
  useEffect(() => {
    stopAuto();
    startAuto();
    return () => {
      anim.current?.cancel();
      anim.current = null;
    };
  }, [startAuto, stopAuto]);

  // caption: poll a few times a second (cheap), not every frame
  useEffect(() => {
    const id = window.setInterval(() => updateFront(currentAngle()), 150);
    return () => window.clearInterval(id);
  }, [currentAngle, updateFront]);

  // JS-driven motion: drag, inertia, snapping to a picked card
  const runLoop = useCallback(() => {
    if (loopRaf.current) return;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let active = !!drag.current;
      if (!drag.current) {
        if (target.current !== null) {
          const d = target.current - angle.current;
          angle.current += d * Math.min(1, dt * 7);
          active = true;
          if (Math.abs(d) < 0.05) {
            angle.current = target.current;
            target.current = null;
          }
        } else if (Math.abs(velocity.current) > 0.5) {
          angle.current += velocity.current * dt;
          velocity.current *= Math.pow(0.08, dt);
          active = true;
        }
      }
      if (ringRef.current) ringRef.current.style.transform = T(angle.current);
      updateFront(angle.current);
      if (active) loopRaf.current = requestAnimationFrame(frame);
      else {
        loopRaf.current = 0;
        startAuto(); // hand back to the compositor
      }
    };
    loopRaf.current = requestAnimationFrame(frame);
  }, [T, startAuto, updateFront]);

  useEffect(() => () => cancelAnimationFrame(loopRaf.current), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    stopAuto();
    drag.current = { x: e.clientX, a: angle.current, t: performance.now(), moved: 0 };
    target.current = null;
    velocity.current = 0;
    runLoop();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved > 4) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const deg = (dx / cardWidth()) * step * 1.1;
    const now = performance.now();
    const prev = angle.current;
    angle.current = d.a - deg;
    velocity.current = ((angle.current - prev) / Math.max(1, now - d.t)) * 1000;
    d.t = now;
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    justDragged.current = !!d && d.moved > 4;
    if (d && d.moved > 4) {
      // settle on the nearest card after the throw
      const projected = angle.current + velocity.current * 0.35;
      target.current = Math.round(projected / step) * step;
      velocity.current = 0;
    }
    runLoop();
  };

  const goTo = (i: number) => {
    stopAuto();
    // shortest rotation to bring panel i to the front
    const base = i * step;
    const k = Math.round((angle.current - base) / 360);
    target.current = base + k * 360;
    velocity.current = 0;
    runLoop();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={stageRef}
        className="no-select relative min-h-0 flex-1 cursor-grab touch-pan-y active:cursor-grabbing"
        style={{ containerType: "size" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => {
          hover.current = true;
          easeRate(HOVER_RATE);
        }}
        onMouseLeave={() => {
          hover.current = false;
          easeRate(1);
        }}
        aria-roledescription="carousel"
        aria-label="Sample Co-wrapped cards"
        role="region"
      >
        <div className="ring-stage absolute inset-0">
        <div className="ring-push absolute left-1/2 top-1/2">
        <div ref={ringRef} className="ring-rotor absolute left-0 top-0 will-change-transform">
          {all.map((it, i) => {
            const dup = i >= items.length;
            const card = (
              <Link
                key={i}
                href={it.href}
                draggable={false}
                tabIndex={dup ? -1 : 0}
                aria-hidden={dup || undefined}
                aria-label={`Play the ${it.title.replace(/^The /, "")} sample — ${it.subtitle}`}
                onClick={(e) => {
                  if (justDragged.current) {
                    justDragged.current = false;
                    e.preventDefault();
                    return;
                  }
                  const isFront = (((Math.round(currentAngle() / step) % n) + n) % n) === i;
                  if (!isFront) {
                    e.preventDefault();
                    goTo(i);
                    return;
                  }
                  track("sample_selected", { sample: it.sample, from: "landing" });
                }}
                onFocus={() => goTo(i)}
                className="ring-card absolute block overflow-hidden rounded-[10px] bg-white shadow-[0_14px_22px_-16px_rgb(0_0_0/0.4)] ring-1 ring-black/[0.06] outline-offset-4"
                style={{
                  ["--a" as string]: `${i * step}deg`,
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                {i < 2 || i === n - 1 || restReady ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.src}
                  srcSet={`${it.src.replace(".webp", "-720.webp")} 720w, ${it.src} 1080w`}
                  sizes="(max-width: 639px) 80vw, (max-width: 1023px) 56vw, min(38vw, 620px)"
                  alt={dup ? "" : it.alt}
                  width={720}
                  height={378}
                  draggable={false}
                  loading="eager"
                  fetchPriority={i === 0 ? "high" : i < 2 || i === n - 1 ? "auto" : "low"}
                  decoding="async"
                  className="pointer-events-none h-full w-full object-cover"
                />
                ) : (
                  <span aria-hidden className="block h-full w-full bg-[#f1efe9]" />
                )}
              </Link>
            );
            // the front card shares a name with the story frame: opening a sample morphs one into the other
            return i === frontPanel ? (
              <ViewTransition key={i} name="story-frame" share="morph" default="none">
                {card}
              </ViewTransition>
            ) : (
              card
            );
          })}
        </div>
        </div>
        </div>
      </div>

    </div>
  );
}
