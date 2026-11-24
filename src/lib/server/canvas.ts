import path from "node:path";
import { GlobalFonts, Path2D, createCanvas } from "@napi-rs/canvas";
import { drawCard, CARD_SIZES, type CardSize, type Ctx, type Path2DCtor } from "../card/render";
import type { CardData } from "../share/card-data";

// Registered under their real family names ("Bricolage Grotesque", "Instrument Serif"):
// aliasing several weights to one name collapses them to a single weight in Skia.
let registered = false;
function registerFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  for (const w of ["400", "600", "800"]) GlobalFonts.registerFromPath(path.join(dir, `display-${w}.ttf`));
  GlobalFonts.registerFromPath(path.join(dir, "serif-italic.ttf"));
  registered = true;
}

/** Server-side card render (OG images, sample exports) using the shared renderer. */
export function renderCardPng(data: CardData, size: CardSize): Buffer {
  registerFonts();
  const { w, h } = CARD_SIZES[size];
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  drawCard(ctx, data, size, Path2D as unknown as Path2DCtor);
  return canvas.toBuffer("image/png");
}
