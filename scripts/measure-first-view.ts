/**
 * When does a visitor actually SEE the carousel? Slow-4G network + 4× CPU throttle.
 * Reports ms from navigation start until (a) the wordmark is painted and (b) the front
 * card is visible (image decoded and its ring opaque).
 * BASE=http://localhost:3200 npx tsx scripts/measure-first-view.ts
 */
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3200";
(async () => {
  const out: number[][] = [];
  for (let run = 0; run < 3; run++) {
    const b = await chromium.launch({ channel: "chrome" });
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // poll from the very first script that runs on the page
    await page.addInitScript(`(() => {
      window.__fv = {};
      const tick = () => {
        const h1 = document.querySelector("h1");
        if (h1 && !window.__fv.word && h1.getBoundingClientRect().width > 0) window.__fv.word = performance.now();
        const img = document.querySelector('[aria-roledescription="carousel"] a img');
        let el = img, op = 1;
        while (el && el !== document.body) { op *= parseFloat(getComputedStyle(el).opacity); el = el.parentElement; }
        if (img && img.complete && img.naturalWidth > 0 && op > 0.9 && !window.__fv.card) window.__fv.card = performance.now();
        if (!window.__fv.card) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForFunction("window.__fv && window.__fv.card", null, { timeout: 30000 });
    const fv = (await page.evaluate("window.__fv")) as { word: number; card: number };
    out.push([Math.round(fv.word), Math.round(fv.card)]);
    await b.close();
  }
  console.log(BASE, "wordmark visible ms:", out.map((x) => x[0]), "| front card visible ms:", out.map((x) => x[1]));
})();
