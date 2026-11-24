import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const fixture = (n: string) => fs.readFileSync(path.join(__dirname, "../../fixtures", n), "utf8");

/** Force the download path (headless Chrome may expose Web Share). */
export async function noWebShare(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }));
}

export async function slideIndex(page: Page) {
  return Number(await page.getByTestId("slide-index").textContent());
}

export async function slideCount(page: Page) {
  return page.locator('[aria-roledescription="story"] > div.pointer-events-none.absolute.inset-x-0.top-0 > div').count();
}

export async function goToEnd(page: Page) {
  const n = await slideCount(page);
  for (let i = 0; i < n; i++) {
    if ((await slideIndex(page)) === n - 1) break;
    await page.keyboard.press("ArrowRight");
  }
}

export function pngSize(buf: Buffer) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

export async function events(page: Page) {
  return page.evaluate(() => (window as unknown as { __cwEvents?: unknown[] }).__cwEvents ?? []);
}
