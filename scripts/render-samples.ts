/**
 * Renders the three sample personas' cards with the shared renderer.
 *  - public/samples/*.webp  (landing page thumbnails)
 *  - docs/exports/*.png     (all 3 styles × 2 sizes × 3 samples, for review/launch)
 * Run: npx tsx scripts/render-samples.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, Path2D, GlobalFonts } from "@napi-rs/canvas";
import { renderCardPng } from "../src/lib/server/canvas";
import { cardFromSummary } from "../src/lib/share/card-data";
import { sampleSummary } from "../src/lib/samples/summary";
import { SAMPLE_IDS } from "../src/lib/samples/data";
import { CARD_STYLES } from "../src/lib/share/payload";
import { drawCard, type Ctx, type Path2DCtor } from "../src/lib/card/render";

const root = path.join(__dirname, "..");
fs.mkdirSync(path.join(root, "public/samples"), { recursive: true });
fs.mkdirSync(path.join(root, "docs/exports"), { recursive: true });
void GlobalFonts;
for (const id of SAMPLE_IDS) {
  for (const style of CARD_STYLES) {
    const card = cardFromSummary(sampleSummary(id, style));
    for (const size of ["story", "landscape"] as const) {
      fs.writeFileSync(path.join(root, `docs/exports/${id}-${style}-${size}.png`), renderCardPng(card, size));
    }
  }
  // landing thumbnail: achievement, landscape, webp at 2/3 scale
  const card = cardFromSummary(sampleSummary(id, "achievement"));
  renderCardPng(card, "landscape"); // registers fonts
  const c = createCanvas(800, 420);
  const ctx = c.getContext("2d") as unknown as Ctx;
  (ctx as unknown as { scale: (x: number, y: number) => void }).scale(800 / 1200, 420 / 630);
  drawCard(ctx, card, "landscape", Path2D as unknown as Path2DCtor);
  fs.writeFileSync(path.join(root, `public/samples/${id}.webp`), c.toBuffer("image/webp", 82));
  console.log(id, sampleSummary(id).persona, sampleSummary(id).total);
}
