/**
 * Visual inspection harness: screenshots every slide of every sample, key UI
 * states, and downloads real browser exports (all styles × sizes).
 * Requires a running server: BASE=http://localhost:3200 npx tsx scripts/capture.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, devices, type Page } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = path.join(__dirname, "..", "docs", "screenshots");
const EXP = path.join(__dirname, "..", "docs", "exports", "browser");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(EXP, { recursive: true });

function pngSize(buf: Buffer) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function slideCount(page: Page) {
  return page.locator('[aria-roledescription="story"] .pointer-events-none.absolute.inset-x-0.top-0 > div').count();
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const only = process.argv[2];
  for (const [label, ctxOpts] of [
    ["mobile", { ...devices["Pixel 7"], reducedMotion: "reduce" as const }],
    ["desktop", { viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" as const }],
  ] as const) {
    if (only && only !== label) continue;
    const ctx = await browser.newContext({ ...ctxOpts, acceptDownloads: true });
    await ctx.addInitScript(() => {
      // force the download path so exports land on disk
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${label}-landing.png`, fullPage: label === "desktop" });

    for (const id of ["marathoner", "closer", "optimist"]) {
      await page.goto(`${BASE}/sample/${id}`);
      await page.getByTestId("pause-toggle").click();
      const n = await slideCount(page);
      for (let i = 0; i < n; i++) {
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${OUT}/${label}-${id}-slide${i + 1}.png` });
        if (i < n - 1) await page.keyboard.press("ArrowRight");
      }
      if (label === "mobile" && id === "marathoner") {
        await page.getByTestId("open-share").click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${label}-share-sheet.png` });
        for (const style of ["achievement", "comedy", "minimal"]) {
          await page.getByTestId(`style-${style}`).click();
          for (const size of ["story", "landscape"]) {
            await page.getByTestId(`size-${size}`).click();
            const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-card").click()]);
            const file = `${EXP}/${id}-${style}-${size}.png`;
            await dl.saveAs(file);
            const { w, h } = pngSize(fs.readFileSync(file));
            console.log("export", style, size, w, h);
          }
        }
        await page.getByTestId("style-achievement").click();
        await page.getByTestId("size-story").click();
        await page.locator('[data-testid="why-persona"] summary').click();
        await page.locator('[data-testid="why-persona"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${OUT}/${label}-why-persona.png` });
      }
    }

    // import flow with messy fixture
    await page.goto(`${BASE}/make`);
    await page.screenshot({ path: `${OUT}/${label}-make.png` });
    await page.getByTestId("paste-input").fill(fs.readFileSync(path.join(__dirname, "../fixtures/03-ambiguous-statuses.csv"), "utf8"));
    await page.getByTestId("continue").click();
    await page.getByTestId("play-story").first().waitFor();
    await page.screenshot({ path: `${OUT}/${label}-review.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
