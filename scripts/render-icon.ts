/**
 * Previews src/app/icon.svg at common sizes and writes the 180×180 Apple touch icon.
 * (The SVG itself is generated from Allo's glyph outlines by scripts/make-icon.py.)
 * Usage: npx tsx scripts/render-icon.ts <preview.png>
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";
(async () => {
  const svg = fs.readFileSync("src/app/icon.svg", "utf8");
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ viewport: { width: 760, height: 300 } });
  await p.setContent(`<body style="margin:0;background:#2b2b2e;display:flex;gap:28px;align-items:center;padding:24px">
    ${[256, 128, 64, 32, 16].map((s) => `<div style="width:${s}px;height:${s}px">${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}</div>`).join("")}
    <div style="background:#fff;padding:10px;border-radius:8px;display:flex;gap:10px">${[32, 16].map((s) => svg.replace("<svg ", `<svg width="${s}" height="${s}" `)).join("")}</div></body>`);
  await p.screenshot({ path: process.argv[2] });
  // apple-touch icon 180×180 PNG (iOS doesn't use SVG)
  const q = await b.newPage({ viewport: { width: 180, height: 180 } });
  await q.setContent(`<body style="margin:0">${svg.replace("<svg ", '<svg width="180" height="180" ').replace('rx="15"', 'rx="0"')}</body>`);
  await q.screenshot({ path: "src/app/apple-icon.png" });
  await b.close();
})();
