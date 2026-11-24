"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/events/track";

export interface RingItem {
  src: string;
  href: string;
  title: string;
  subtitle: string;
  alt: string;
  sample: "marathoner" | "closer" | "optimist";
}

const ASPECT = 378 / 720;
const SPEED = 7; // degrees per second
const PANELS = 18; // 20° apart, two full cycles of the 9 sample cards: a full-width curved band

/**
 * A slowly turning 3D ring of sample cards (CSS 3D, no WebGL).
 * Angle lives in a ref and is written straight to the DOM each frame; React
 * state only changes when the front card changes (for the caption).
 */
export function CardRing({ items }: { items: RingItem[] }) {
  const all = Array.from({ length: PANELS }, (_, i) => items[i % items.length]);
  const n = all.length;
  const step = 360 / n;

  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const drag = useRef<{ x: number; a: number; t: number; moved: number } | null>(null);
  const hover = useRef(false);
  const justDragged = useRef(false);
  const [size, setSize] = useState({ w: 0, r: 0, p: 900 });
  const [front, setFront] = useState(0);
  const [reduced, setReduced] = useState(false);

  // size the ring from the stage box
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const narrow = width < 640;
      const mid = width < 1024;
      let w = Math.min(width * (narrow ? 0.8 : mid ? 0.56 : 0.38), 620);
      w = Math.min(w, (height * 0.8) / ASPECT);
      const r = w / 2 / Math.tan(Math.PI / n) + 6;
      // a short perspective relative to the ring radius gives the strong band curvature
      setSize({ w, r, p: Math.max(480, r * (narrow ? 1.0 : 0.8)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const apply = useCallback(() => {
    const ring = ringRef.current;
    if (ring) ring.style.transform = `translateZ(${-size.r}px) rotateY(${-angle.current}deg)`;
    const idx = (((Math.round(angle.current / step) % n) + n) % n) % items.length;
    setFront((f) => (f === idx ? f : idx));
  }, [size.r, step, n, items.length]);

  // animation loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!drag.current) {
        if (target.current !== null) {
          const d = target.current - angle.current;
          angle.current += d * Math.min(1, dt * 7);
          if (Math.abs(d) < 0.05) {
            angle.current = target.current;
            target.current = null;
          }
        } else if (Math.abs(velocity.current) > 0.5) {
          angle.current += velocity.current * dt;
          velocity.current *= Math.pow(0.08, dt); // inertia decay
        } else if (!hover.current && !reduced) {
          angle.current += SPEED * dt;
        }
      }
      apply();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [apply, reduced]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, a: angle.current, t: performance.now(), moved: 0 };
    target.current = null;
    velocity.current = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved > 4) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const deg = (dx / Math.max(1, size.w)) * step * 1.1;
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
  };

  const goTo = (i: number) => {
    // shortest rotation to bring panel i to the front
    const cur = angle.current;
    const base = i * step;
    const k = Math.round((cur - base) / 360);
    target.current = base + k * 360;
    velocity.current = 0;
  };

  const rotateBy = (dir: 1 | -1) => goTo(Math.round(angle.current / step) + dir);

  const cur = items[front];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={stageRef}
        className="no-select relative min-h-0 flex-1 cursor-grab touch-pan-y active:cursor-grabbing"
        style={{ perspective: `${size.p}px`, perspectiveOrigin: "50% 42%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => (hover.current = true)}
        onMouseLeave={() => (hover.current = false)}
        aria-roledescription="carousel"
        aria-label="Sample Co-op Wrapped cards"
        role="region"
      >
        <div
          ref={ringRef}
          className="absolute left-1/2 top-1/2"
          style={{ transformStyle: "preserve-3d", width: 0, height: 0, opacity: size.w ? 1 : 0, transition: "opacity 400ms" }}
        >
          {all.map((it, i) => {
            const dup = i >= items.length;
            return (
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
                  const isFront = (((Math.round(angle.current / step) % n) + n) % n) === i;
                  if (!isFront) {
                    e.preventDefault();
                    goTo(i);
                    return;
                  }
                  track("sample_selected", { sample: it.sample, from: "landing" });
                }}
                onFocus={() => goTo(i)}
                className="absolute block overflow-hidden rounded-[10px] bg-white shadow-[0_1px_0_rgb(0_0_0/0.04),0_20px_40px_-24px_rgb(0_0_0/0.35)] ring-1 ring-black/[0.06] outline-offset-4"
                style={{
                  width: size.w,
                  height: size.w * ASPECT,
                  left: -size.w / 2,
                  top: (-size.w * ASPECT) / 2,
                  transform: `rotateY(${i * step}deg) translateZ(${size.r}px)`,
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.src}
                  alt={dup ? "" : it.alt}
                  width={720}
                  height={378}
                  draggable={false}
                  loading={i < 3 || i > n - 3 ? "eager" : "lazy"}
                  decoding="async"
                  className="pointer-events-none h-full w-full object-cover"
                />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-[clamp(0.5rem,2dvh,1.5rem)] flex items-center justify-center gap-4 text-center">
        <button type="button" onClick={() => rotateBy(-1)} className="grid h-9 w-9 place-items-center rounded-full text-ink/60 hover:bg-black/5 hover:text-ink" aria-label="Previous card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div aria-live="polite" className="min-w-[14rem]">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{cur?.title}</p>
          <p className="text-[15px] text-ink/60">{cur?.subtitle}</p>
        </div>
        <button type="button" onClick={() => rotateBy(1)} className="grid h-9 w-9 place-items-center rounded-full text-ink/60 hover:bg-black/5 hover:text-ink" aria-label="Next card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}
