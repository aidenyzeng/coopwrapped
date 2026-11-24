/** Shared visual identity: used by DOM slides, the canvas card renderer and OG images. */

export const COLORS = {
  ink: "#121116",
  paper: "#F4EEE3",
  tomato: "#FF5A36",
  ultra: "#3240F0",
  lime: "#D8F65C",
  pink: "#FFB0D5",
  mint: "#86E6C4",
  sun: "#FFC83A",
} as const;

export type ColorName = keyof typeof COLORS;

export type ThemeId = "paper" | "ink" | "tomato" | "ultra" | "lime" | "pink" | "mint" | "sun";

export interface Theme {
  id: ThemeId;
  bg: string;
  fg: string;
  accent: string;
  /** secondary accent used for illustration fills */
  accent2: string;
  muted: string; // fg at reduced emphasis (pre-mixed for canvas)
}

export const THEMES: Record<ThemeId, Theme> = {
  paper: { id: "paper", bg: COLORS.paper, fg: COLORS.ink, accent: COLORS.tomato, accent2: COLORS.ultra, muted: "#5f5a55" },
  ink: { id: "ink", bg: COLORS.ink, fg: COLORS.paper, accent: COLORS.lime, accent2: COLORS.pink, muted: "#b4aea6" },
  tomato: { id: "tomato", bg: COLORS.tomato, fg: COLORS.ink, accent: COLORS.paper, accent2: COLORS.sun, muted: "#3d1a10" },
  ultra: { id: "ultra", bg: COLORS.ultra, fg: COLORS.paper, accent: COLORS.pink, accent2: COLORS.lime, muted: "#d4d6fb" },
  lime: { id: "lime", bg: COLORS.lime, fg: COLORS.ink, accent: COLORS.ultra, accent2: COLORS.tomato, muted: "#3c4415" },
  pink: { id: "pink", bg: COLORS.pink, fg: COLORS.ink, accent: COLORS.ultra, accent2: COLORS.tomato, muted: "#4c2a3a" },
  mint: { id: "mint", bg: COLORS.mint, fg: COLORS.ink, accent: COLORS.tomato, accent2: COLORS.ultra, muted: "#1e4a3b" },
  sun: { id: "sun", bg: COLORS.sun, fg: COLORS.ink, accent: COLORS.ultra, accent2: COLORS.tomato, muted: "#4a3a0c" },
};

/** Tone colour that stays legible on ink (ultra is too dark on black). */
export function onInk(tone: ThemeId): string {
  return tone === "ultra" ? "#A3AAFF" : tone === "paper" || tone === "ink" ? COLORS.lime : THEMES[tone].bg;
}

export const FONT_DISPLAY = "Bricolage Grotesque";
export const FONT_SERIF = "Instrument Serif";

export const PRODUCT_NAME = "Co-wrapped";

/** Hostname printed on cards. Configure NEXT_PUBLIC_SITE_URL before launch. */
export function siteHost(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "https://cowrapped.app";
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Mulberry32 — tiny deterministic PRNG for visual seeds. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
