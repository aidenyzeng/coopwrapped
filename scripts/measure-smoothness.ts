/**
 * Frame-time measurement under 4× CPU throttling (approximates a mid-range phone).
 * BASE=http://localhost:3200 npx tsx scripts/measure-smoothness.ts
 */
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3200";

async function measure(path: string, seconds: number) {
  const b = await chromium.launch({ channel: "chrome" });
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(BASE + path);
  await page.waitForTimeout(Number(process.env.WARMUP ?? 1500));
  await cdp.send("Performance.enable");
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m: { name: string; value: number }) => [m.name, m.value]));
  const before = await metric();
  // passed as a string: tsx would otherwise inject helpers that don't exist in the page
  const r = await page.evaluate(`(async () => {
    const secs = ${seconds};
    const frames = [];
    let longTasks = 0, longTaskMs = 0;
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => { longTasks++; longTaskMs += e.duration; }));
    po.observe({ type: "longtask", buffered: false });
    let last = performance.now();
    await new Promise((res) => {
      const end = last + secs * 1000;
      function f(now) { frames.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    po.disconnect();
    frames.sort((a, b) => a - b);
    const pct = (p) => frames[Math.floor(frames.length * p)];
    return { fps: +(frames.length / secs).toFixed(1), p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), jank: frames.filter((x) => x > 50).length, longTasks, longTaskMs: Math.round(longTaskMs) };
  })()`);
  const after = await metric();
  const ms = (k: string) => Math.round((after[k] - before[k]) * 1000);
  await b.close();
  // main-thread CPU spent over the window (ms): JS, style recalcs, layout — the real cost of re-rendering
  return { ...(r as object), scriptMs: ms("ScriptDuration"), styleMs: ms("RecalcStyleDuration"), layoutMs: ms("LayoutDuration"), taskMs: ms("TaskDuration") };
}

(async () => {
  for (const p of ["/sample/marathoner", "/"]) console.log(p.padEnd(20), JSON.stringify(await measure(p, 6)));
})();
