/**
 * Verifies the landing page fits one screen (no scroll) at common sizes and saves screenshots.
 * BASE=http://localhost:3200 npx tsx scripts/check-landing-fit.ts <outDir>
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.argv[2] ?? "docs/screenshots/landing";
fs.mkdirSync(OUT, { recursive: true });
const sizes: [string, number, number, boolean][] = [
  ["phone-360x640", 360, 640, true], ["phone-375x667", 375, 667, true], ["phone-412x915", 412, 915, true],
  ["tablet-768x1024", 768, 1024, true], ["laptop-1280x720", 1280, 720, false], ["laptop-1366x768", 1366, 768, false],
  ["desktop-1440x900", 1440, 900, false], ["desktop-1920x1080", 1920, 1080, false],
];
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  let ok = true;
  for (const [name, width, height, mobile] of sizes) {
    const c = await b.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.goto(BASE + "/");
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1800);
    const m = await p.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      w: document.documentElement.scrollWidth,
      // the front card must be fully visible and the CTA must not overlap the caption
      frontCard: (() => {
        const r = document.querySelector('[aria-roledescription="carousel"] a')!.getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)];
      })(),
      ctaBottom: Math.round([...document.querySelectorAll("main a")].at(-1)!.getBoundingClientRect().bottom),
    }));
    const fits = m.h <= height && m.w <= width;
    ok &&= fits;
    console.log(name.padEnd(18), fits ? "FITS   " : "SCROLLS", JSON.stringify(m));
    await p.screenshot({ path: `${OUT}/${name}.png` });
    await c.close();
  }
  await b.close();
  process.exit(ok ? 0 : 1);
})();
