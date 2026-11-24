"use client";

import { CARD_SIZES, drawCard, drawSlidePoster, ensureCardFonts, type CardSize } from "@/lib/card/render";
import type { CardData } from "@/lib/share/card-data";
import type { SlideSpec } from "@/lib/story/plan";

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
}

export async function renderCardBlob(data: CardData, size: CardSize): Promise<Blob> {
  await ensureCardFonts();
  const { w, h } = CARD_SIZES[size];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawCard(c.getContext("2d")!, data, size);
  return canvasToBlob(c);
}

export async function renderSlideBlob(spec: SlideSpec, host: string): Promise<Blob> {
  await ensureCardFonts();
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  drawSlidePoster(c.getContext("2d")!, spec, host);
  return canvasToBlob(c);
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Share via the OS sheet when possible, otherwise download. Returns which path ran. */
export async function shareOrDownload(blob: Blob, filename: string, text?: string): Promise<"web_share" | "download" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], text });
      return "web_share";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // fall through to download on other errors
    }
  }
  download(blob, filename);
  return "download";
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
