"use client";

import { useEffect, useRef } from "react";

/**
 * "co-wrapped" set in Allo (OFL, Josh Puckett) with a living weight/roundness wave,
 * after portfolios.here. Each letter's `wght` and `ROND` ripple across the word;
 * near the pointer, letters swell. The soft "ink" edge is an SVG filter: a small blur
 * whose alpha is re-thresholded, so edges stay crisp-ish but read as printed.
 *
 * Performance: font-variation changes re-flow and repaint the filtered text, so the wave
 * only runs while the pointer is over the wordmark (load uses a CSS blur-in instead).
 */
const TEXT = "co-wrapped";
const REST = { w: 270, r: 90 }; // portfolios.here rests around wght ~267, ROND ~89

export function Wordmark({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const h = ref.current;
    if (!h) return;
    const letters = [...h.querySelectorAll<HTMLSpanElement>("span[data-i]")];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const set = (el: HTMLSpanElement, w: number, r: number) => {
      el.style.fontVariationSettings = `"wght" ${w.toFixed(1)}, "ROND" ${r.toFixed(1)}`;
    };
    if (reduced) {
      letters.forEach((el) => set(el, REST.w, REST.r));
      return;
    }

    let raf = 0;
    let pointerX: number | null = null;
    let centers: number[] = [];
    let letterW = 40;
    const measure = () => {
      centers = letters.map((el) => {
        const b = el.getBoundingClientRect();
        return b.left + b.width / 2;
      });
      letterW = Math.max(30, h.getBoundingClientRect().width / TEXT.length);
    };
    let activeUntil = 0; // no automatic intro wave: it re-flows text every frame; the wave runs only while the pointer is near
    let amp = 0; // eases toward 1 while the pointer is near, back to 0 after
    const start = performance.now();

    let lastWrite = 0;
    const frame = (now: number) => {
      // variation changes re-flow the text: write at ~30 fps, which still reads smooth for a slow ripple
      if (now - lastWrite < 31) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastWrite = now;
      const t = (now - start) / 1000;
      const active = now < activeUntil || pointerX !== null;
      amp += ((active ? 1 : 0) - amp) * 0.06;
      letters.forEach((el, i) => {
        const wave = Math.sin(t * 2.1 - i * 0.62);
        let w = REST.w + amp * 70 * wave;
        let r = REST.r + amp * 12 * Math.sin(t * 1.3 - i * 0.45);
        if (pointerX !== null && centers.length) {
          // letter centres are measured once per pointer entry, never inside the write loop
          const d = (pointerX - centers[i]) / letterW;
          const near = Math.exp(-d * d * 0.5);
          w += near * 220;
          r += near * 10;
        }
        set(el, Math.max(250, Math.min(650, w)), Math.max(40, Math.min(100, r)));
      });
      if (amp > 0.002 || active) raf = requestAnimationFrame(frame);
      else {
        letters.forEach((el) => set(el, REST.w, REST.r));
        raf = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onEnter = () => measure();
    const onMove = (e: PointerEvent) => {
      if (!centers.length) measure();
      pointerX = e.clientX;
      kick();
    };
    const onLeave = () => {
      pointerX = null;
      centers = [];
      activeUntil = performance.now() + 600;
    };
    h.addEventListener("pointerenter", onEnter);
    h.addEventListener("pointermove", onMove);
    h.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      h.removeEventListener("pointerenter", onEnter);
      h.removeEventListener("pointermove", onMove);
      h.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <h1 ref={ref} aria-label={TEXT} className={`wordmark ${className}`}>
      <svg width="0" height="0" aria-hidden className="absolute">
        <filter id="ink" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncA type="linear" slope="2.5" intercept="-0.5" />
          </feComponentTransfer>
        </filter>
      </svg>
      <span aria-hidden className="inline-block">
        {[...TEXT].map((ch, i) => (
          <span key={i} data-i={i} style={{ fontVariationSettings: `"wght" ${REST.w}, "ROND" ${REST.r}` }}>
            {ch}
          </span>
        ))}
      </span>
    </h1>
  );
}
