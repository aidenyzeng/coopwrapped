import type { PersonaId } from "../persona/personas";
import { rng } from "../design/tokens";

/**
 * Persona illustration system: a perforated "postage stamp" with a geometric
 * glyph per persona. Defined as primitive shapes in a 100×100 box so the same
 * data renders to SVG (DOM story) and canvas (exports, OG images).
 */

export type Shape =
  | { t: "path"; d: string; fill?: string; stroke?: string; lw?: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; lw?: number };

export interface StampColors {
  paper: string; // stamp face
  ink: string; // glyph strokes
  accent: string; // glyph fill
  accent2: string;
  hole: string; // perforation colour (= background behind the stamp)
}

export interface Stamp {
  rotation: number; // degrees
  shapes: Shape[];
}

const r1 = (n: number) => Math.round(n * 100) / 100;

function poly(points: [number, number][]) {
  return "M" + points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L") + " Z";
}

function star(cx: number, cy: number, n: number, ro: number, ri: number, rot = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n;
    const r = i % 2 ? ri : ro;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

function glyph(id: PersonaId, c: StampColors): Shape[] {
  const ink = c.ink;
  switch (id) {
    case "closer":
      return [
        { t: "path", d: star(50, 52, 14, 30, 24, -Math.PI / 2), fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "circle", cx: 50, cy: 52, r: 17, fill: c.paper, stroke: ink, lw: 2.5 },
        { t: "path", d: "M41 52 L48 59 L60 45", stroke: ink, lw: 4.5 },
      ];
    case "contender":
      return [
        { t: "path", d: "M24 78 H76", stroke: ink, lw: 3 },
        { t: "path", d: poly([[28, 78], [28, 62], [40, 62], [40, 78]]), fill: c.accent2, stroke: ink, lw: 2.5 },
        { t: "path", d: poly([[44, 78], [44, 50], [56, 50], [56, 78]]), fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "path", d: poly([[60, 78], [60, 66], [72, 66], [72, 78]]), fill: c.paper, stroke: ink, lw: 2.5 },
        { t: "path", d: star(50, 33, 5, 11, 4.6, -Math.PI / 2), fill: c.accent, stroke: ink, lw: 2.5 },
      ];
    case "first_move":
      return [
        { t: "path", d: poly([[22, 50], [78, 28], [62, 76], [50, 58]]), fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "path", d: poly([[50, 58], [78, 28], [44, 70]]), fill: c.accent2, stroke: ink, lw: 2.5 },
        { t: "path", d: "M30 70 Q24 78 18 76", stroke: ink, lw: 2.5 },
      ];
    case "magnet":
      return [
        { t: "path", d: "M30 30 V54 A20 20 0 0 0 70 54 V30 H58 V54 A8 8 0 0 1 42 54 V30 Z", fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "path", d: poly([[30, 30], [42, 30], [42, 39], [30, 39]]), fill: c.paper, stroke: ink, lw: 2.5 },
        { t: "path", d: poly([[58, 30], [70, 30], [70, 39], [58, 39]]), fill: c.paper, stroke: ink, lw: 2.5 },
        { t: "path", d: "M24 22 L18 16 M50 20 V12 M76 22 L82 16", stroke: ink, lw: 2.5 },
      ];
    case "marathoner":
      return [28, 20, 12].map((rx, i) => ({
        t: "path" as const,
        d: `M${50 - rx} ${50 - rx * 0.7} H${50 + rx} A${rx * 0.7} ${rx * 0.7} 0 0 1 ${50 + rx} ${50 + rx * 0.7} H${50 - rx} A${rx * 0.7} ${rx * 0.7} 0 0 1 ${50 - rx} ${50 - rx * 0.7} Z`,
        fill: i === 0 ? c.accent : i === 1 ? c.paper : c.accent2,
        stroke: ink,
        lw: 2.5,
      }));
    case "sprinter":
      return [
        { t: "path", d: poly([[56, 16], [28, 56], [48, 56], [42, 84], [72, 42], [52, 42]]), fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "path", d: "M18 40 H30 M14 50 H26 M20 60 H30", stroke: ink, lw: 2.5 },
      ];
    case "metronome":
      return [
        { t: "path", d: poly([[38, 22], [62, 22], [74, 80], [26, 80]]), fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "path", d: poly([[34, 66], [66, 66], [69, 80], [31, 80]]), fill: c.paper, stroke: ink, lw: 2.5 },
        { t: "path", d: "M50 66 L64 26", stroke: ink, lw: 3 },
        { t: "circle", cx: 59.5, cy: 39, r: 4, fill: c.accent2, stroke: ink, lw: 2 },
      ];
    case "comeback":
      return [
        { t: "path", d: "M70 50 A20 20 0 1 1 62 34", stroke: ink, lw: 9 },
        { t: "path", d: "M70 50 A20 20 0 1 1 62 34", stroke: c.accent, lw: 4.5 },
        { t: "path", d: poly([[56, 22], [74, 30], [60, 42]]), fill: c.accent2, stroke: ink, lw: 2.5 },
      ];
    case "sharpshooter":
      return [
        { t: "circle", cx: 46, cy: 54, r: 26, fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "circle", cx: 46, cy: 54, r: 17, fill: c.paper, stroke: ink, lw: 2.5 },
        { t: "circle", cx: 46, cy: 54, r: 8, fill: c.accent2, stroke: ink, lw: 2.5 },
        { t: "path", d: "M46 54 L78 22", stroke: ink, lw: 3 },
        { t: "path", d: poly([[78, 22], [70, 22], [78, 14], [86, 14], [86, 22], [78, 30]]), fill: c.paper, stroke: ink, lw: 2 },
      ];
    case "optimist": {
      const rays: string[] = [];
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (Math.PI * (i + 0.5)) / 7;
        rays.push(`M${r1(50 + Math.cos(a) * 26)} ${r1(64 + Math.sin(a) * 26)} L${r1(50 + Math.cos(a) * 36)} ${r1(64 + Math.sin(a) * 36)}`);
      }
      return [
        { t: "path", d: rays.join(" "), stroke: ink, lw: 3 },
        { t: "path", d: "M30 64 A20 20 0 0 1 70 64 Z", fill: c.accent, stroke: ink, lw: 2.5 },
        { t: "path", d: "M18 64 H82 M26 72 H74 M36 80 H64", stroke: ink, lw: 2.5 },
      ];
    }
    case "builder": {
      const out: Shape[] = [];
      const rows = [[26, 50, 74], [38, 62], [50]];
      rows.forEach((xs, ri) =>
        xs.forEach((x, i) =>
          out.push({
            t: "path",
            d: poly([[x - 12, 78 - ri * 14], [x + 12, 78 - ri * 14], [x + 12, 66 - ri * 14], [x - 12, 66 - ri * 14]]),
            fill: (ri + i) % 2 ? c.accent2 : c.accent,
            stroke: ink,
            lw: 2.5,
          }),
        ),
      );
      out.push({ t: "path", d: star(50, 30, 4, 8, 3, 0), fill: c.paper, stroke: ink, lw: 2 });
      return out;
    }
  }
}

/** Stamp with perforated edges. Holes are drawn in the background colour. */
export function stamp(id: PersonaId, seed: number, c: StampColors): Stamp {
  const r = rng(seed);
  const rotation = r1(-7 + r() * 14);
  const shapes: Shape[] = [];
  shapes.push({ t: "path", d: "M0 0 H100 V100 H0 Z", fill: c.paper });
  const holes = 9;
  const hr = 3.2;
  for (let i = 0; i <= holes; i++) {
    const p = (100 * i) / holes;
    shapes.push({ t: "circle", cx: p, cy: 0, r: hr, fill: c.hole });
    shapes.push({ t: "circle", cx: p, cy: 100, r: hr, fill: c.hole });
    shapes.push({ t: "circle", cx: 0, cy: p, r: hr, fill: c.hole });
    shapes.push({ t: "circle", cx: 100, cy: p, r: hr, fill: c.hole });
  }
  shapes.push({ t: "path", d: "M8 8 H92 V92 H8 Z", stroke: c.ink, lw: 1.6 });
  shapes.push(...glyph(id, c));
  return { rotation, shapes };
}

/** Wavy postmark cancellation lines + ring, positioned by seed. */
export function postmark(seed: number, ink: string): Shape[] {
  const r = rng(seed ^ 0x51ed);
  const amp = 2.4 + r() * 1.2;
  const lines: string[] = [];
  for (let k = 0; k < 4; k++) {
    const y = 30 + k * 11;
    let d = `M0 ${y}`;
    for (let x = 0; x < 100; x += 10) d += ` Q${x + 5} ${r1(y + ((x / 10) % 2 ? amp : -amp))} ${x + 10} ${y}`;
    lines.push(d);
  }
  return [
    { t: "circle", cx: 20, cy: 46, r: 17, stroke: ink, lw: 1.6 },
    { t: "circle", cx: 20, cy: 46, r: 13, stroke: ink, lw: 0.8 },
    { t: "path", d: lines.join(" "), stroke: ink, lw: 1.6 },
  ];
}
