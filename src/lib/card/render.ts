import { COLORS, FONT_DISPLAY, FONT_SERIF, PRODUCT_NAME, THEMES, onInk, rng, type Theme } from "../design/tokens";
import type { CardData } from "../share/card-data";
import { postmark, stamp, type Shape } from "./illustration";
import type { SlideSpec } from "../story/plan";

/**
 * One canvas renderer for every card surface: the in-app preview (scaled with
 * CSS), the exported PNG, and server-side Open Graph images (@napi-rs/canvas).
 * Keep this file free of DOM/Node APIs except the injected Path2D constructor.
 */

export type Ctx = CanvasRenderingContext2D;
export type Path2DCtor = new (d?: string) => Path2D;

export const CARD_SIZES = {
  story: { w: 1080, h: 1920 },
  landscape: { w: 1200, h: 630 },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

interface Env {
  P2D: Path2DCtor;
}

/* ---------------------------------------------------------------- helpers */

function font(ctx: Ctx, weight: 400 | 600 | 800, size: number, serif = false) {
  ctx.font = serif ? `italic 400 ${size}px "${FONT_SERIF}"` : `${weight} ${size}px "${FONT_DISPLAY}"`;
}

function tracking(ctx: Ctx, em: number, size: number) {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${Math.round(em * size * 10) / 10}px`;
}

/** Largest size ≤ max at which `text` fits `maxW`. */
function fit(ctx: Ctx, text: string, weight: 400 | 600 | 800, maxW: number, max: number, min: number, em = 0, serif = false) {
  let size = max;
  while (size > min) {
    font(ctx, weight, size, serif);
    tracking(ctx, em, size);
    if (ctx.measureText(text).width <= maxW) break;
    size -= Math.max(1, Math.round(size * 0.04));
  }
  font(ctx, weight, size, serif);
  tracking(ctx, em, size);
  return size;
}

function wrap(ctx: Ctx, text: string, maxW: number, maxLines = 4): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  // avoid a one-word last line ("now.") by pulling a word down when it fits
  if (lines.length > 1) {
    const last = lines[lines.length - 1];
    const prev = lines[lines.length - 2].split(" ");
    if (!last.includes(" ") && prev.length >= 3) {
      const moved = `${prev[prev.length - 1]} ${last}`;
      if (ctx.measureText(moved).width <= maxW) {
        lines[lines.length - 2] = prev.slice(0, -1).join(" ");
        lines[lines.length - 1] = moved;
      }
    }
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S+$/, "") + "…";
    return kept;
  }
  return lines;
}

/** Fit a wrapped block into maxLines by shrinking. Returns lines + size. */
function fitWrap(ctx: Ctx, text: string, weight: 400 | 600 | 800, maxW: number, maxLines: number, max: number, min: number, em = 0) {
  let size = max;
  for (;;) {
    font(ctx, weight, size);
    tracking(ctx, em, size);
    const lines = wrap(ctx, text, maxW, 99);
    if (lines.length <= maxLines || size <= min) return { lines: lines.length <= maxLines ? lines : wrap(ctx, text, maxW, maxLines), size };
    size -= 2;
  }
}

function drawShapes(ctx: Ctx, env: Env, shapes: Shape[], cx: number, cy: number, size: number, rotationDeg = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  const k = size / 100;
  ctx.scale(k, k);
  ctx.translate(-50, -50);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const s of shapes) {
    if (s.t === "circle") {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.lw ?? 2;
        ctx.stroke();
      }
    } else {
      const p = new env.P2D(s.d);
      if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill(p);
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.lw ?? 2;
        ctx.stroke(p);
      }
    }
  }
  ctx.restore();
}

function drawStamp(ctx: Ctx, env: Env, data: CardData, theme: Theme, hole: string, cx: number, cy: number, size: number, shadow = true) {
  const st = stamp(data.personaId, data.seed, {
    paper: COLORS.paper,
    ink: COLORS.ink,
    accent: THEMES[data.tone].bg,
    accent2: theme.accent2 === THEMES[data.tone].bg ? COLORS.ultra : theme.accent2,
    hole,
  });
  if (shadow) {
    // offset solid shadow — print-like, not blurry
    ctx.save();
    ctx.translate(size * 0.035, size * 0.035);
    drawShapes(ctx, env, [{ t: "path", d: "M0 0 H100 V100 H0 Z", fill: COLORS.ink }], cx, cy, size, st.rotation);
    ctx.restore();
  }
  drawShapes(ctx, env, st.shapes, cx, cy, size, st.rotation);
}

function grain(ctx: Ctx, w: number, h: number, seed: number, color: string, alpha: number) {
  const r = rng(seed ^ 0xa11ce);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const n = Math.round((w * h) / 900);
  for (let i = 0; i < n; i++) ctx.fillRect(r() * w, r() * h, 1.6, 1.6);
  ctx.restore();
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function text(ctx: Ctx, t: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}

function footer(ctx: Ctx, data: CardData, x: number, y: number, w: number, fg: string, muted: string, size: number) {
  font(ctx, 800, size);
  tracking(ctx, -0.01, size);
  text(ctx, PRODUCT_NAME, x, y, fg);
  font(ctx, 400, size * 0.92);
  tracking(ctx, 0, size);
  text(ctx, data.host, x + w, y, muted, "right");
}

/* ---------------------------------------------------------------- styles */

function achievementStory(ctx: Ctx, env: Env, d: CardData, W: number, H: number) {
  const M = 88;
  const tone = THEMES[d.tone];
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, d.seed, COLORS.ink, 0.05);

  font(ctx, 600, 30);
  tracking(ctx, 0.14, 30);
  text(ctx, "MY CO-OP SEARCH", M, 150, COLORS.ink);
  ctx.fillStyle = tone.bg;
  ctx.beginPath();
  ctx.arc(W - M - 14, 140, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.stroke();

  const num = fmt(d.total);
  const ns = fit(ctx, num, 800, W - 2 * M, 560, 200, -0.05);
  const numBase = 210 + ns * 0.76;
  text(ctx, num, M - ns * 0.03, numBase, COLORS.ink);
  const ls = 112;
  font(ctx, 400, ls, true);
  tracking(ctx, -0.01, ls);
  text(ctx, d.total === 1 ? "application" : "applications", M, numBase + ls * 1.02, COLORS.ink);

  // persona block
  const bx = M, by = 1000, bw = W - 2 * M, bh = 470;
  ctx.fillStyle = COLORS.ink;
  roundRect(ctx, bx + 12, by + 12, bw, bh, 30);
  ctx.fill();
  ctx.fillStyle = tone.bg;
  roundRect(ctx, bx, by, bw, bh, 30);
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 4;
  ctx.stroke();
  drawStamp(ctx, env, d, tone, tone.bg, bx + bw - 150, by - 10, 250);
  font(ctx, 600, 26);
  tracking(ctx, 0.14, 26);
  text(ctx, "SEARCH PERSONA", bx + 48, by + 84, tone.fg);
  const name = fitWrap(ctx, d.personaName, 800, bw - 96 - 230, 2, 100, 64, -0.03);
  name.lines.forEach((l, i) => text(ctx, l, bx + 44, by + 84 + name.size * (1.05 + i * 0.98), tone.fg));
  const nameBottom = by + 84 + name.size * (1.05 + (name.lines.length - 1) * 0.98);
  const sent = fitWrap(ctx, d.personaSentence, 400, bw - 96, 3, 40, 30);
  sent.lines.forEach((l, i) => text(ctx, l, bx + 48, nameBottom + 70 + i * sent.size * 1.28, tone.fg));

  // stats
  statsRow(ctx, d, M, 1580, W - 2 * M, COLORS.ink, "#5f5a55", 92);

  if (d.companyLine) {
    font(ctx, 400, 28);
    tracking(ctx, 0, 28);
    text(ctx, d.companyLine, M, 1758, "#5f5a55");
  }
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(M, 1785, W - 2 * M, 3);
  footer(ctx, d, M, 1848, W - 2 * M, COLORS.ink, "#5f5a55", 34);
}

function statsRow(ctx: Ctx, d: CardData, x: number, y: number, w: number, fg: string, muted: string, vs: number) {
  const n = d.stats.length;
  if (!n) return;
  const colW = w / n;
  d.stats.forEach((s, i) => {
    const cx = x + i * colW + (i ? 32 : 0);
    if (i) {
      ctx.fillStyle = fg;
      ctx.fillRect(x + i * colW, y - vs * 0.72, 3, vs * 2.1);
    }
    const size = fit(ctx, s.value, 800, colW - 48, vs, 44, -0.03);
    text(ctx, s.value, cx, y + size * 0.05, fg);
    font(ctx, 400, 30);
    tracking(ctx, 0, 30);
    wrap(ctx, s.label, colW - 48, 2).forEach((l, j) => text(ctx, l, cx, y + 56 + j * 36, muted));
  });
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function achievementLandscape(ctx: Ctx, env: Env, d: CardData, W: number, H: number) {
  const M = 60;
  const tone = THEMES[d.tone];
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, d.seed, COLORS.ink, 0.05);
  const panelX = 760;
  ctx.fillStyle = tone.bg;
  ctx.fillRect(panelX, 0, W - panelX, H);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(panelX, 0, 4, H);

  font(ctx, 600, 20);
  tracking(ctx, 0.14, 20);
  text(ctx, "MY CO-OP SEARCH", M, 82, COLORS.ink);
  const num = fmt(d.total);
  const ns = fit(ctx, num, 800, panelX - 2 * M, 250, 120, -0.05);
  const base = 100 + ns * 0.76;
  text(ctx, num, M - ns * 0.03, base, COLORS.ink);
  font(ctx, 400, 60, true);
  tracking(ctx, 0, 60);
  text(ctx, d.total === 1 ? "application" : "applications", M + 4, base + 64, COLORS.ink);

  const ps = fit(ctx, d.personaName, 800, panelX - 2 * M, 46, 30, -0.02);
  text(ctx, d.personaName, M, base + 140, COLORS.ink);
  const sent = fitWrap(ctx, d.personaSentence, 400, panelX - 2 * M, 2, 24, 18);
  sent.lines.forEach((l, i) => text(ctx, l, M, base + 140 + ps * 0.4 + 30 + i * sent.size * 1.3, "#4a4540"));
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(M, H - 78, panelX - 2 * M, 2);
  footer(ctx, d, M, H - 40, panelX - 2 * M, COLORS.ink, "#5f5a55", 22);

  // right panel: stamp + stats
  const rx = panelX + 52;
  const rw = W - rx - 48;
  drawStamp(ctx, env, d, tone, tone.bg, panelX + (W - panelX) / 2, d.stats.length ? 150 : H / 2, d.stats.length ? 190 : 280);
  d.stats.forEach((s, i) => {
    const y = 330 + i * 88 + (3 - d.stats.length) * 30;
    const vs = fit(ctx, s.value, 800, 150, 54, 30, -0.03);
    text(ctx, s.value, rx, y + 18, tone.fg);
    font(ctx, 400, 20);
    tracking(ctx, 0, 20);
    const vw = Math.max(150, 0);
    wrap(ctx, s.label, rw - vw - 10, 2).forEach((l, j) => text(ctx, l, rx + vw + 10, y + j * 24 + (vs > 40 ? 0 : 6), tone.fg));
    ctx.fillStyle = tone.fg;
    ctx.globalAlpha = 0.5;
    if (i < d.stats.length - 1) ctx.fillRect(rx, y + 46, rw, 1.5);
    ctx.globalAlpha = 1;
  });
  if (d.companyLine) {
    font(ctx, 400, 16);
    text(ctx, d.companyLine, rx, H - 34, tone.fg);
  }
}


/**
 * Postmark next to the big number: beside it when there's room, otherwise
 * behind it at low opacity so it never hurts the number's legibility.
 */
function postmarkNear(ctx: Ctx, env: Env, d: CardData, fg: string, numLeft: number, numW: number, base: number, ns: number, maxRight: number, desired: number) {
  const start = numLeft + numW + ns * 0.08;
  const room = maxRight - start;
  ctx.save();
  if (room >= desired * 0.45) {
    const size = Math.min(desired, room);
    drawShapes(ctx, env, postmark(d.seed, fg), start + size / 2, base - ns * 0.38, size, 0);
  } else {
    ctx.globalAlpha = 0.16;
    drawShapes(ctx, env, postmark(d.seed, fg), numLeft + numW * 0.62, base - ns * 0.38, Math.min(desired, numW), 0);
  }
  ctx.restore();
}

const COMEDY_HEADLINE = "Times I said “I’m excited to apply”:";

function receipt(ctx: Ctx, d: CardData, x: number, y: number, w: number, rowH: number, fs: number) {
  const rows = d.stats.length ? d.stats : [{ value: fmt(d.total), label: "applications" }];
  const h = 70 + rows.length * rowH + 40;
  // paper with zigzag bottom
  ctx.save();
  ctx.translate(fs * 0.25, fs * 0.25);
  ctx.fillStyle = COLORS.ink;
  receiptPath(ctx, x, y, w, h, fs);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLORS.paper;
  receiptPath(ctx, x, y, w, h, fs);
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.stroke();
  font(ctx, 600, fs * 0.8);
  tracking(ctx, 0.16, fs * 0.8);
  text(ctx, "ITEMIZED", x + 32, y + 52, COLORS.ink);
  rows.forEach((r, i) => {
    const ry = y + 70 + (i + 0.62) * rowH;
    font(ctx, 400, fs);
    tracking(ctx, 0, fs);
    const label = r.label.toUpperCase();
    const lw = ctx.measureText(label).width;
    text(ctx, label, x + 32, ry, COLORS.ink);
    font(ctx, 800, fs * 1.15);
    tracking(ctx, -0.01, fs);
    const vw = ctx.measureText(r.value).width;
    text(ctx, r.value, x + w - 32, ry, COLORS.ink, "right");
    // dotted leader
    ctx.fillStyle = COLORS.ink;
    for (let dx = x + 32 + lw + 14; dx < x + w - 32 - vw - 14; dx += fs * 0.5) ctx.fillRect(dx, ry - 3, 3, 3);
  });
  return h;
}

function receiptPath(ctx: Ctx, x: number, y: number, w: number, h: number, fs: number) {
  const z = fs * 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  const n = Math.max(4, Math.round(w / (z * 1.6)));
  for (let i = n; i > 0; i--) {
    ctx.lineTo(x + ((i - 0.5) * w) / n, y + h - z);
    ctx.lineTo(x + ((i - 1) * w) / n, y + h);
  }
  ctx.closePath();
}

function comedyStory(ctx: Ctx, env: Env, d: CardData, W: number, H: number) {
  const M = 84;
  const t = THEMES[d.tone];
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, d.seed, COLORS.ink, 0.07);

  // measure pass
  const hl = fitWrap(ctx, COMEDY_HEADLINE, 400, W - 2 * M, 2, 72, 50);
  font(ctx, 400, hl.size, true);
  const hlLines = wrap(ctx, COMEDY_HEADLINE, W - 2 * M, 2);
  const num = fmt(d.total);
  const ns = fit(ctx, num, 800, W - 2 * M, 600, 220, -0.06);
  const ps = fit(ctx, d.personaName, 800, W - 2 * M - 300, 84, 52, -0.02);
  const sent = fitWrap(ctx, d.personaSentence, 400, W - 2 * M, 3, 42, 32);
  const rows = Math.max(1, d.stats.length);
  const receiptH = 70 + rows * 84 + 40;
  const content =
    hlLines.length * hl.size * 1.1 + 40 + ns * 0.72 + 120 + ps * 1.35 + 90 + sent.lines.length * sent.size * 1.28 + 40 + receiptH;
  const top = 150;
  const avail = H - 190 - top;
  const gap = Math.max(0, (avail - content) / 4);

  // draw pass
  let y = top + Math.min(gap, 60);
  font(ctx, 400, hl.size, true);
  tracking(ctx, -0.01, hl.size);
  hlLines.forEach((l, i) => text(ctx, l, M, y + hl.size * 0.8 + i * hl.size * 1.1, t.fg));
  y += hlLines.length * hl.size * 1.1 + 40 + gap;
  const base = y + ns * 0.72;
  font(ctx, 800, ns);
  tracking(ctx, -0.06, ns);
  postmarkNear(ctx, env, d, t.fg, M - ns * 0.03, ctx.measureText(num).width, base, ns, W - M, 520);
  font(ctx, 800, ns);
  tracking(ctx, -0.06, ns);
  text(ctx, num, M - ns * 0.03, base, t.fg);

  const py = base + 120 + gap;
  ctx.save();
  ctx.translate(M, py);
  ctx.rotate(-0.025);
  font(ctx, 800, ps);
  tracking(ctx, -0.02, ps);
  const pw = ctx.measureText(d.personaName).width + 64;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, pw, ps * 1.35);
  text(ctx, d.personaName, 32, ps * 1.02, COLORS.paper);
  ctx.restore();
  drawStamp(ctx, env, d, t, t.bg, W - M - 120, py + 40, 230);
  font(ctx, 400, sent.size);
  tracking(ctx, 0, sent.size);
  sent.lines.forEach((l, i) => text(ctx, l, M, py + ps * 1.35 + 90 + i * sent.size * 1.28, t.fg));

  const ry = py + ps * 1.35 + 90 + sent.lines.length * sent.size * 1.28 + 40 + gap;
  receipt(ctx, d, M, ry, W - 2 * M, 84, 34);

  if (d.companyLine) {
    font(ctx, 400, 28);
    tracking(ctx, 0, 28);
    text(ctx, d.companyLine, M, H - 140, t.fg);
  }
  ctx.fillStyle = t.fg;
  ctx.fillRect(M, H - 112, W - 2 * M, 3);
  footer(ctx, d, M, H - 56, W - 2 * M, t.fg, t.fg, 34);
}

function comedyLandscape(ctx: Ctx, env: Env, d: CardData, W: number, H: number) {
  const M = 56;
  const t = THEMES[d.tone];
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, d.seed, COLORS.ink, 0.07);
  const leftW = 640;
  // measure, then centre the left column between the top margin and the footer
  const hs = fit(ctx, COMEDY_HEADLINE, 400, leftW - M, 34, 22, 0, true);
  const num = fmt(d.total);
  const ns = fit(ctx, num, 800, leftW - M, 280, 120, -0.06);
  const ps = fit(ctx, d.personaName, 800, leftW - M - 40, 42, 26, -0.02);
  const sent = fitWrap(ctx, d.personaSentence, 400, leftW - M, 2, 23, 17);
  const blockH = hs * 1.1 + ns * 0.78 + 34 + ps * 1.4 + 38 + (sent.lines.length - 1) * sent.size * 1.3 + sent.size * 0.3;
  const top = Math.max(56, (H - 70 - blockH) / 2 + 8);

  const hy = top + hs * 0.8;
  fit(ctx, COMEDY_HEADLINE, 400, leftW - M, 34, 22, 0, true);
  text(ctx, COMEDY_HEADLINE, M, hy, t.fg);
  const base = hy + hs * 0.3 + ns * 0.78;
  font(ctx, 800, ns);
  tracking(ctx, -0.06, ns);
  postmarkNear(ctx, env, d, t.fg, M - ns * 0.03, ctx.measureText(num).width, base, ns, leftW + 20, 300);
  font(ctx, 800, ns);
  tracking(ctx, -0.06, ns);
  text(ctx, num, M - ns * 0.03, base, t.fg);
  ctx.save();
  ctx.translate(M, base + 34);
  ctx.rotate(-0.025);
  font(ctx, 800, ps);
  tracking(ctx, -0.02, ps);
  const pw = ctx.measureText(d.personaName).width + 36;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, pw, ps * 1.4);
  text(ctx, d.personaName, 18, ps * 1.06, COLORS.paper);
  ctx.restore();
  font(ctx, 400, sent.size);
  tracking(ctx, 0, sent.size);
  sent.lines.forEach((l, i) => text(ctx, l, M, base + 34 + ps * 1.4 + 38 + i * sent.size * 1.3, t.fg));
  footer(ctx, d, M, H - 34, W - 2 * M, t.fg, t.fg, 20);

  const rx = leftW + 70;
  const rw = W - rx - M;
  const rows = Math.max(1, d.stats.length);
  const rh = 70 + rows * 64 + 40;
  const ry = Math.max(176, (H - 70 - rh) / 2 + 60);
  drawStamp(ctx, env, d, t, t.bg, W - M - 70, ry - 76, 140);
  receipt(ctx, d, rx, ry, rw, 64, 22);
}

function minimalStory(ctx: Ctx, env: Env, d: CardData, W: number, H: number) {
  const M = 92;
  const accent = onInk(d.tone);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, d.seed, COLORS.paper, 0.035);

  font(ctx, 800, 34);
  tracking(ctx, -0.01, 34);
  text(ctx, PRODUCT_NAME, M, 150, accent);
  drawStamp(ctx, env, d, THEMES.ink, COLORS.ink, W - M - 60, 130, 120, false);

  const num = fmt(d.total);
  const ns = fit(ctx, num, 800, W - 2 * M + 20, 640, 220, -0.06);
  const base = 900;
  text(ctx, num, M - ns * 0.04, base, COLORS.paper);
  font(ctx, 400, 56);
  tracking(ctx, -0.01, 56);
  text(ctx, d.total === 1 ? "application." : "applications.", M, base + 90, COLORS.paper);

  ctx.fillStyle = accent;
  ctx.fillRect(M, base + 170, 120, 8);
  const ps = fitWrap(ctx, d.personaName, 800, W - 2 * M, 2, 84, 56, -0.02);
  ps.lines.forEach((l, i) => text(ctx, l, M, base + 290 + i * ps.size, accent));
  const sy = base + 290 + (ps.lines.length - 1) * ps.size + 70;
  const sent = fitWrap(ctx, d.personaSentence, 400, W - 2 * M, 3, 38, 30);
  sent.lines.forEach((l, i) => text(ctx, l, M, sy + i * sent.size * 1.3, "#b4aea6"));

  let y = sy + sent.lines.length * sent.size * 1.3 + 70;
  d.stats.forEach((s) => {
    ctx.fillStyle = "#3a3840";
    ctx.fillRect(M, y - 52, W - 2 * M, 2);
    font(ctx, 800, 44);
    tracking(ctx, -0.01, 44);
    text(ctx, s.value, M, y + 6, COLORS.paper);
    font(ctx, 400, 34);
    tracking(ctx, 0, 34);
    text(ctx, s.label, M + 220, y + 4, "#b4aea6");
    y += 92;
  });
  if (d.companyLine) {
    font(ctx, 400, 28);
    text(ctx, d.companyLine, M, H - 130, "#b4aea6");
  }
  font(ctx, 400, 30);
  tracking(ctx, 0, 30);
  text(ctx, d.host, M, H - 76, "#b4aea6");
}

function minimalLandscape(ctx: Ctx, env: Env, d: CardData, W: number, H: number) {
  const M = 64;
  const accent = onInk(d.tone);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, d.seed, COLORS.paper, 0.035);
  const num = fmt(d.total);
  const ns = fit(ctx, num, 800, 560, 380, 140, -0.06);
  text(ctx, num, M - ns * 0.04, 70 + ns * 0.76, COLORS.paper);
  font(ctx, 400, 34);
  tracking(ctx, 0, 34);
  text(ctx, d.total === 1 ? "application." : "applications.", M, 70 + ns * 0.76 + 56, COLORS.paper);
  font(ctx, 800, 24);
  tracking(ctx, -0.01, 24);
  text(ctx, PRODUCT_NAME, M, H - 48, accent);
  font(ctx, 400, 22);
  text(ctx, d.host, M + 200, H - 48, "#b4aea6");

  const rx = 690;
  const rw = W - rx - M;
  ctx.fillStyle = accent;
  ctx.fillRect(rx, 96, 80, 6);
  const ps = fitWrap(ctx, d.personaName, 800, rw, 2, 48, 32, -0.02);
  ps.lines.forEach((l, i) => text(ctx, l, rx, 166 + i * ps.size, accent));
  const sy = 166 + (ps.lines.length - 1) * ps.size + 44;
  const sent = fitWrap(ctx, d.personaSentence, 400, rw, 3, 22, 18);
  sent.lines.forEach((l, i) => text(ctx, l, rx, sy + i * sent.size * 1.32, "#b4aea6"));
  let y = sy + sent.lines.length * sent.size * 1.32 + 50;
  d.stats.forEach((s) => {
    ctx.fillStyle = "#3a3840";
    ctx.fillRect(rx, y - 32, rw, 1.5);
    font(ctx, 800, 28);
    text(ctx, s.value, rx, y + 4, COLORS.paper);
    font(ctx, 400, 20);
    text(ctx, s.label, rx + 120, y + 2, "#b4aea6");
    y += 54;
  });
  drawStamp(ctx, env, d, THEMES.ink, COLORS.ink, W - M - 34, H - 64, 64, false);
}

/* ---------------------------------------------------------------- entry */

export function drawCard(ctx: Ctx, data: CardData, size: CardSize, P2D: Path2DCtor = globalThis.Path2D) {
  const { w, h } = CARD_SIZES[size];
  const env = { P2D };
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.clearRect(0, 0, w, h);
  const fn =
    data.style === "achievement"
      ? size === "story" ? achievementStory : achievementLandscape
      : data.style === "comedy"
        ? size === "story" ? comedyStory : comedyLandscape
        : size === "story" ? minimalStory : minimalLandscape;
  fn(ctx, env, data, w, h);
  ctx.restore();
}

/** Browser: make sure the card fonts are ready before drawing (exports must never fall back). */
export async function ensureCardFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`800 100px "${FONT_DISPLAY}"`),
    document.fonts.load(`600 100px "${FONT_DISPLAY}"`),
    document.fonts.load(`400 100px "${FONT_DISPLAY}"`),
    document.fonts.load(`italic 400 100px "${FONT_SERIF}"`),
  ]);
}

/* ---------------------------------------------------------------- slide posters */


/** Export any story slide as a 1080×1920 poster using the same type system as cards. */
export function drawSlidePoster(ctx: Ctx, spec: SlideSpec, host: string, P2D: Path2DCtor = globalThis.Path2D) {
  const W = 1080, H = 1920, M = 88;
  const t = THEMES[spec.theme];
  const env = { P2D };
  const c = spec.content;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, spec.seed, t.fg, 0.05);

  font(ctx, 600, 34);
  tracking(ctx, 0.14, 34);
  text(ctx, c.eyebrow.toUpperCase(), M, 190, t.fg);

  let y = 300;
  if (spec.type === "persona" && c.viz?.kind === "stamp") {
    const cardish = { personaId: c.viz.persona, seed: spec.seed, tone: spec.theme } as CardData;
    drawStamp(ctx, env, cardish, t, t.bg, W / 2, 640, 520);
    y = 1080;
  } else if (spec.type === "intro") {
    y = 640;
  }
  if (c.hero) {
    const hs = fit(ctx, c.hero, 800, W - 2 * M, 460, 180, -0.05);
    y += hs * 0.78;
    text(ctx, c.hero, M - hs * 0.03, y, t.fg);
    if (c.heroLabel) {
      const lab = fitWrap(ctx, c.heroLabel, 400, W - 2 * M, 3, 84, 56);
      font(ctx, 400, lab.size, true);
      tracking(ctx, -0.01, lab.size);
      const lines = wrap(ctx, c.heroLabel, W - 2 * M, 3);
      lines.forEach((l, i) => text(ctx, l, M, y + lab.size * 1.15 + i * lab.size * 1.05, t.fg));
      y += lab.size * 1.15 + (lines.length - 1) * lab.size * 1.05;
    }
    y += 150;
  }
  const big = spec.type === "intro" || spec.type === "persona";
  const hl = fitWrap(ctx, c.headline, 800, W - 2 * M, 4, big ? 140 : 84, 56, -0.03);
  hl.lines.forEach((l, i) => text(ctx, l, M, y + i * hl.size * 1.02, t.fg));
  y += (hl.lines.length - 1) * hl.size * 1.02;
  if (c.body) {
    if (spec.type === "intro") {
      const bs = fit(ctx, c.body, 400, W - 2 * M, 200, 90, -0.02, true);
      text(ctx, c.body, M, y + bs * 1.05, t.accent);
    } else {
      const b = fitWrap(ctx, c.body, 400, W - 2 * M, 4, 46, 34);
      b.lines.forEach((l, i) => text(ctx, l, M, y + 90 + i * b.size * 1.3, t.fg));
    }
  }
  if (c.footnote) {
    const f = fitWrap(ctx, c.footnote, 400, W - 2 * M, 3, 28, 22);
    f.lines.forEach((l, i) => text(ctx, l, M, H - 220 - (f.lines.length - 1 - i) * f.size * 1.3, t.fg));
  }
  ctx.fillStyle = t.fg;
  ctx.fillRect(M, H - 150, W - 2 * M, 3);
  footer(ctx, { host } as CardData, M, H - 90, W - 2 * M, t.fg, t.fg, 34);
  ctx.restore();
}
