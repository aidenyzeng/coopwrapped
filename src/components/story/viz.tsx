"use client";

import { motion } from "motion/react";
import type { Viz } from "@/lib/story/plan";
import type { Theme } from "@/lib/design/tokens";
import { shortDate } from "@/lib/analytics/metrics";

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Envelope tally: one mark per application (capped), revealing in a quick ripple. */
export function Tally({ count, theme, still }: { count: number; theme: Theme; still: boolean }) {
  const shown = Math.min(count, 150);
  const per = shown > 80 ? 15 : shown > 30 ? 10 : 6;
  return (
    <div className="flex flex-wrap gap-[1.1cqw]" aria-hidden>
      {Array.from({ length: shown }, (_, i) => (
        <motion.span
          key={i}
          className="block rounded-[0.4cqw]"
          style={{
            width: shown > 80 ? "3.2cqw" : "4.6cqw",
            height: shown > 80 ? "2.2cqw" : "3.2cqw",
            background: i % per === per - 1 ? theme.accent : "transparent",
            border: `0.45cqw solid ${theme.fg}`,
          }}
          initial={still ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 + i * (1.2 / shown), duration: 0.25 }}
        />
      ))}
      {count > shown ? <span className="text-[3.6cqw] font-semibold" style={{ color: theme.fg }}>+{count - shown}</span> : null}
    </div>
  );
}

export function WeeklyBars({ viz, theme, still }: { viz: Extract<Viz, { kind: "weekly" }>; theme: Theme; still: boolean }) {
  const max = Math.max(...viz.weeks.map((w) => w.count), 1);
  return (
    <figure className="w-full" aria-label={`Applications per week, busiest week ${shortDate(viz.weeks[viz.highlight]?.start ?? viz.weeks[0].start)}`}>
      <div className="flex h-[30cqw] items-end gap-[0.8cqw]">
        {viz.weeks.map((w, i) => (
          <motion.div
            key={w.start}
            className="flex-1 origin-bottom rounded-t-[0.6cqw]"
            style={{
              height: `${Math.max(2, (w.count / max) * 100)}%`,
              background: i === viz.highlight ? theme.accent : theme.fg,
              opacity: i === viz.highlight ? 1 : 0.35,
              border: i === viz.highlight ? `0.4cqw solid ${theme.fg}` : undefined,
            }}
            initial={still ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.4 + i * 0.03, duration: 0.5, ease }}
          />
        ))}
      </div>
      <figcaption className="mt-[1.5cqw] flex justify-between text-[3cqw] font-semibold opacity-80">
        <span>{shortDate(viz.weeks[0].start)}</span>
        <span>{shortDate(viz.weeks[viz.weeks.length - 1].start)}</span>
      </figcaption>
    </figure>
  );
}

export function OutcomeBars({ viz, theme, still }: { viz: Extract<Viz, { kind: "outcomes" }>; theme: Theme; still: boolean }) {
  return (
    <ul className="w-full space-y-[2cqw]">
      {viz.rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-[3cqw] gap-y-[0.8cqw]">
          <span className="text-[3.8cqw] font-semibold leading-tight">{r.label}</span>
          <span className="tabular text-[3.8cqw] font-extrabold">
            {r.count}
            <span className="font-normal opacity-70"> / {viz.denominator}</span>
          </span>
          <div className="col-span-2 h-[2.6cqw] overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${theme.fg} 16%, transparent)` }}>
            <motion.div
              className="h-full origin-left rounded-full"
              style={{
                width: `${Math.max(1.5, (r.count / viz.denominator) * 100)}%`,
                background: r.tone === "accent" ? theme.accent : r.tone === "fg" ? theme.fg : `color-mix(in srgb, ${theme.fg} 55%, transparent)`,
              }}
              initial={still ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.7, ease }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatsList({ items, theme, still }: { items: { value: string; label: string }[]; theme: Theme; still: boolean }) {
  return (
    <ul className="w-full divide-y-[0.4cqw]" style={{ borderColor: theme.fg }}>
      {items.map((s, i) => (
        <motion.li
          key={s.label}
          className="flex items-baseline gap-[4cqw] py-[3cqw]"
          style={{ borderColor: `color-mix(in srgb, ${theme.fg} 30%, transparent)` }}
          initial={still ? false : { opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 + i * 0.25, duration: 0.5, ease }}
        >
          <span className="tabular min-w-[26cqw] text-[11cqw] font-extrabold leading-none tracking-tight">{s.value}</span>
          <span className="text-[4.2cqw] font-semibold leading-tight">{s.label}</span>
        </motion.li>
      ))}
    </ul>
  );
}

/** Celebration: confetti tiles bursting out of the centre stamp. Pure transform/opacity. */
export function Burst({ theme, still }: { theme: Theme; still: boolean }) {
  const rays = 16;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: rays }, (_, i) => {
        const a = (i / rays) * Math.PI * 2;
        const r = i % 2 ? 40 : 33; // in cqw
        const to = { x: `${Math.cos(a) * r}cqw`, y: `${Math.sin(a) * r * 1.05}cqw`, scale: 1, rotate: i * 25, opacity: 1 };
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 -ml-[2.5cqw] -mt-[2.5cqw] block h-[5cqw] w-[5cqw] rounded-[1cqw]"
            style={{ background: i % 2 ? theme.accent : theme.accent2, border: `0.5cqw solid ${theme.fg}` }}
            initial={still ? to : { x: 0, y: 0, scale: 0.2, rotate: 0, opacity: 0 }}
            animate={to}
            transition={{ delay: 0.5, duration: 1.1, ease }}
          />
        );
      })}
    </div>
  );
}

/** Part-of-whole dot grid: the highlighted dots are the stat, the rest give the denominator. */
export function Ratio({ part, whole, theme, still }: { part: number; whole: number; theme: Theme; still: boolean }) {
  const shown = Math.min(whole, 150);
  const scaled = whole > shown ? Math.round((part / whole) * shown) : part;
  const big = shown <= 40;
  return (
    <div className="flex flex-wrap gap-[1.2cqw]" role="img" aria-label={`${part} of ${whole}`}>
      {Array.from({ length: shown }, (_, i) => (
        <motion.span
          key={i}
          className="block rounded-full"
          style={{
            width: big ? "5.4cqw" : "3.4cqw",
            height: big ? "5.4cqw" : "3.4cqw",
            background: i < scaled ? theme.accent : "transparent",
            border: `0.45cqw solid ${theme.fg}`,
            opacity: i < scaled ? 1 : 0.45,
          }}
          initial={still ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6 + i * (1 / shown), duration: 0.25 }}
        />
      ))}
    </div>
  );
}
