"use client";

import { animate, motion } from "motion/react";
import { memo, useEffect, useRef, type ReactNode } from "react";
import type { SlideSpec } from "@/lib/story/plan";
import { THEMES } from "@/lib/design/tokens";
import { Postmark, Stamp } from "../Stamp";
import { Burst, OutcomeBars, Ratio, StatsList, Tally, WeeklyBars } from "./viz";

const ease = [0.2, 0.8, 0.2, 1] as const;

function CountUp({ value, still }: { value: string; still: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const n = Number(value.replace(/,/g, ""));
  useEffect(() => {
    const el = ref.current;
    if (!el || still || !Number.isFinite(n) || n < 10) return;
    const c = animate(0, n, {
      duration: Math.min(1.6, 0.6 + n / 300),
      ease: [0.1, 0.7, 0.2, 1],
      onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("en-US")),
    });
    return () => c.stop();
  }, [n, still]);
  return (
    <span ref={ref} className="tabular">
      {value}
    </span>
  );
}

/** `fade={false}` keeps text visible from the first paint (used for the LCP headline). */
function Reveal({ children, delay, still, className, fade = true }: { children: ReactNode; delay: number; still: boolean; className?: string; fade?: boolean }) {
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: fade ? 0 : 1, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55, ease }}
    >
      {children}
    </motion.div>
  );
}

/** Renders one planned slide. `children` is used by summary/cta slides for their controls. */
/** Memoized: playback ticks re-render the player, but never the slide's animations. */
export const Slide = memo(function Slide({ spec, still, children }: { spec: SlideSpec; still: boolean; children?: ReactNode }) {
  const theme = THEMES[spec.theme];
  const c = spec.content;
  const viz = c.viz;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden px-[7cqw] pb-[8cqw] pt-[21cqw]"
      style={{ background: theme.bg, color: theme.fg }}
    >

      <Reveal delay={0.05} still={still}>
        <p className="text-[3.6cqw] font-semibold uppercase tracking-[0.14em]">{c.eyebrow}</p>
      </Reveal>

      {spec.type === "intro" ? (
        <div className="flex flex-1 flex-col justify-center">
          <Reveal delay={0} still={still} fade={false}>
            <h2 className="text-[13.5cqw] font-extrabold leading-[0.92] tracking-[-0.04em]">{c.headline}</h2>
          </Reveal>
          <Reveal delay={0.7} still={still}>
            <p className="font-serif-i text-[19cqw] leading-[1] tracking-[-0.02em]" style={{ color: theme.accent }}>
              {c.body}
            </p>
          </Reveal>
          <motion.div
            className="mt-[8cqw] w-[40cqw] self-end"
            initial={still ? false : { opacity: 0, rotate: -20, scale: 1.3 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            transition={{ delay: 1.1, duration: 0.6, ease }}
          >
            <Postmark seed={spec.seed} color={theme.fg} className="w-full" />
          </motion.div>
        </div>
      ) : spec.type === "persona" && viz?.kind === "stamp" ? (
        <div className="flex flex-1 flex-col justify-center">
          <motion.div
            className="mx-auto mb-[6cqw] w-[58cqw]"
            initial={still ? false : { opacity: 0, scale: 1.6, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.4, duration: 0.6, ease: [0.2, 0.9, 0.2, 1.25] }}
          >
            <Stamp persona={viz.persona} seed={spec.seed} tone={spec.theme} hole={theme.bg} className="w-full" />
          </motion.div>
          <Reveal delay={1.0} still={still}>
            <h2 className="text-[12.5cqw] font-extrabold leading-[0.95] tracking-[-0.035em]">{c.headline}</h2>
          </Reveal>
          <Reveal delay={1.4} still={still}>
            <p className="mt-[4cqw] text-[5.2cqw] font-medium leading-snug">{c.body}</p>
          </Reveal>
        </div>
      ) : spec.type === "summary" || spec.type === "cta" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Reveal delay={0.1} still={still}>
            <h2 className="mt-[2cqw] text-[9cqw] font-extrabold leading-[0.95] tracking-[-0.03em]">{c.headline}</h2>
          </Reveal>
          {c.body ? (
            <Reveal delay={0.25} still={still}>
              <p className="mt-[3cqw] text-[4.6cqw] font-medium leading-snug">{c.body}</p>
            </Reveal>
          ) : null}
          <div className="mt-[4cqw] flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-[5cqw] pt-[4cqw]">
          <div>
            {c.hero ? (
              <Reveal delay={0.15} still={still}>
                <p className="text-[30cqw] font-extrabold leading-[0.85] tracking-[-0.05em]">
                  <CountUp value={c.hero} still={still} />
                </p>
                {c.heroLabel ? <p className="font-serif-i mt-[2cqw] text-[8.4cqw] leading-[1.02]">{c.heroLabel}</p> : null}
              </Reveal>
            ) : null}
            <Reveal delay={0.6} still={still}>
              <h2 className="mt-[5cqw] text-[7.6cqw] font-extrabold leading-[1.02] tracking-[-0.025em]">{c.headline}</h2>
            </Reveal>
            {c.body ? (
              <Reveal delay={0.85} still={still}>
                <p className="mt-[3cqw] text-[4.6cqw] font-medium leading-snug">{c.body}</p>
              </Reveal>
            ) : null}
          </div>
          <div>
            {viz?.kind === "tally" ? <Tally count={viz.count} theme={theme} still={still} /> : null}
            {viz?.kind === "weekly" ? <WeeklyBars viz={viz} theme={theme} still={still} /> : null}
            {viz?.kind === "outcomes" ? <OutcomeBars viz={viz} theme={theme} still={still} /> : null}
            {viz?.kind === "stats" ? <StatsList items={viz.items} theme={theme} still={still} /> : null}
            {viz?.kind === "ratio" ? <Ratio part={viz.part} whole={viz.whole} theme={theme} still={still} /> : null}
            {viz?.kind === "postmark" ? (
              <motion.div
                initial={still ? false : { opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9, duration: 0.7, ease }}
                className="-mr-[7cqw] ml-auto w-[78cqw]"
              >
                <Postmark seed={spec.seed} color={theme.fg} className="w-full" />
              </motion.div>
            ) : null}
            {viz?.kind === "seal" ? (
              <motion.div
                className="ml-auto mr-[2cqw] w-[46cqw]"
                initial={still ? false : { opacity: 0, scale: 1.4, rotate: 12 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.7, duration: 0.6, ease: [0.2, 0.9, 0.2, 1.25] }}
              >
                <Stamp persona={viz.persona} seed={spec.seed} tone={spec.theme} hole={theme.bg} className="w-full" />
              </motion.div>
            ) : null}
            {viz?.kind === "burst" ? (
              <div className="relative mx-auto mb-[14cqw] w-[44cqw]">
                <Burst theme={theme} still={still} />
              <motion.div
                className="relative w-full"
                initial={still ? false : { opacity: 0, scale: 1.6, rotate: -18 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.2, 0.9, 0.2, 1.25] }}
              >
                <Stamp persona={viz.persona} seed={spec.seed} tone={spec.theme} hole={theme.bg} className="w-full" />
              </motion.div>
              </div>
            ) : null}
            {c.footnote ? <p className="mt-[3cqw] text-[3.2cqw] font-medium leading-snug opacity-80">{c.footnote}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
});
