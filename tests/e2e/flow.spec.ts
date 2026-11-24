import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { events, fixture, goToEnd, noWebShare, pngSize, slideCount, slideIndex } from "./helpers";

test("paste → review → story → export, with no spreadsheet data in analytics", async ({ page }, info) => {
  await noWebShare(page);
  await page.goto("/make");
  const text = fixture("01-messy-headers.tsv");
  await page.getByTestId("paste-input").fill(text);
  await page.getByTestId("continue").click();
  await expect(page.getByRole("heading", { name: /45 applications/ })).toBeVisible();

  // correct a mapping without restarting: un-map then re-map the role column
  const roleSelect = page.getByTestId("map-1"); // "Position Title"
  await expect(roleSelect).toHaveValue("role");
  await roleSelect.selectOption("");
  await expect(page.getByRole("heading", { name: /45 applications/ })).toBeVisible();
  await roleSelect.selectOption("role");

  await page.getByTestId("play-story").first().click();
  await expect(page.getByRole("region", { name: "Your co-op recap" })).toBeVisible();
  await goToEnd(page);
  await page.getByTestId("open-share").click();
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("canvas[data-ready=true]")).toBeVisible();

  for (const size of ["story", "landscape"] as const) {
    await page.getByTestId(`size-${size}`).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-card").click()]);
    const file = info.outputPath(`card-${size}.png`);
    await dl.saveAs(file);
    expect(pngSize(fs.readFileSync(file))).toEqual(size === "story" ? { w: 1080, h: 1920 } : { w: 1200, h: 630 });
  }

  // analytics must not contain any company, role or raw cell values
  const ev = JSON.stringify(await events(page));
  expect(ev).toContain("import_completed");
  expect(ev).toContain("export");
  const cells = text.split(/[\t\n]/).map((c) => c.trim()).filter((c) => c.length > 3 && !/^(yes|no)$/i.test(c));
  for (const c of new Set(cells)) expect(ev).not.toContain(c);
});

test("every card style exports at both sizes", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "covered on desktop; identical renderer");
  await noWebShare(page);
  await page.goto("/sample/closer");
  await goToEnd(page);
  await page.getByTestId("open-share").click();
  for (const style of ["achievement", "comedy", "minimal"]) {
    await page.getByTestId(`style-${style}`).click();
    for (const size of ["story", "landscape"] as const) {
      await page.getByTestId(`size-${size}`).click();
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-card").click()]);
      const file = info.outputPath(`${style}-${size}.png`);
      await dl.saveAs(file);
      expect(pngSize(fs.readFileSync(file))).toEqual(size === "story" ? { w: 1080, h: 1920 } : { w: 1200, h: 630 });
    }
  }
});

test("slides can be exported individually", async ({ page }, info) => {
  await noWebShare(page);
  await page.goto("/sample/optimist");
  await page.getByTestId("pause-toggle").click();
  await page.keyboard.press("ArrowRight");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export this slide as an image" }).click()]);
  const file = info.outputPath("slide.png");
  await dl.saveAs(file);
  expect(pngSize(fs.readFileSync(file))).toEqual({ w: 1080, h: 1920 });
});

test("explicit pause stops auto-advance; play resumes", async ({ page }) => {
  await page.goto("/sample/marathoner");
  await page.getByTestId("pause-toggle").click();
  await expect(page.getByTestId("pause-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(4500); // intro lasts 3.8s
  expect(await slideIndex(page)).toBe(0);
  await page.getByTestId("pause-toggle").click();
  await expect.poll(() => slideIndex(page), { timeout: 8000 }).toBe(1);
});

test("press-and-hold pauses, release resumes", async ({ page }) => {
  await page.goto("/sample/marathoner");
  await expect(page.getByTestId("story-surface")).toBeVisible();
  const box = (await page.getByTestId("story-surface").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.waitForTimeout(4500);
  expect(await slideIndex(page)).toBe(0);
  await page.mouse.up(); // release after a hold must not navigate
  expect(await slideIndex(page)).toBe(0);
  await expect.poll(() => slideIndex(page), { timeout: 8000 }).toBe(1);
});

test("tap zones and keyboard navigate", async ({ page }, info) => {
  await page.goto("/sample/closer");
  await page.getByTestId("pause-toggle").click();
  await expect(page.getByTestId("story-surface")).toBeVisible();
  const box = (await page.getByTestId("story-surface").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5);
  expect(await slideIndex(page)).toBe(1);
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5);
  expect(await slideIndex(page)).toBe(0);
  if (info.project.name === "desktop") {
    await page.locator("body").press("ArrowRight");
    await page.locator("body").press("ArrowRight");
    expect(await slideIndex(page)).toBe(2);
    await page.locator("body").press("ArrowLeft");
    expect(await slideIndex(page)).toBe(1);
  }
});

test("mobile swipe navigates", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "touch only");
  await page.goto("/sample/closer");
  await page.getByTestId("pause-toggle").click();
  await expect(page.getByTestId("story-surface")).toBeVisible();
  const box = (await page.getByTestId("story-surface").boundingBox())!;
  const y = box.y + box.height * 0.5;
  const swipe = async (from: number, to: number) => {
    await page.getByTestId("story-surface").dispatchEvent("pointerdown", { pointerId: 1, clientX: from, clientY: y, button: 0, isPrimary: true, pointerType: "touch" });
    await page.getByTestId("story-surface").dispatchEvent("pointerup", { pointerId: 1, clientX: to, clientY: y + 5, button: 0, isPrimary: true, pointerType: "touch" });
  };
  await swipe(box.x + box.width * 0.8, box.x + box.width * 0.2);
  expect(await slideIndex(page)).toBe(1);
  await swipe(box.x + box.width * 0.2, box.x + box.width * 0.8);
  expect(await slideIndex(page)).toBe(0);
});

test("background tab pauses playback", async ({ page }) => {
  await page.goto("/sample/marathoner");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(4500);
  expect(await slideIndex(page)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => slideIndex(page), { timeout: 8000 }).toBe(1);
});

test("reduced motion renders final values immediately", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/sample/marathoner");
  await page.getByTestId("pause-toggle").click();
  await page.keyboard.press("ArrowRight");
  // count-up skipped: the hero shows the real total right away
  await expect(page.locator("p.tabular, p >> span.tabular").first()).toHaveText("128", { timeout: 300 });
  await ctx.close();
});

test("tiny and missing-data stories never show empty slides or NaN", async ({ page }) => {
  for (const f of ["05-tiny.csv", "02-missing-dates.csv", "08-mostly-unanswered.csv"]) {
    await page.goto("/make");
    await page.getByTestId("paste-input").fill(fixture(f));
    await page.getByTestId("continue").click();
    await page.getByTestId("play-story").first().click();
    await page.getByTestId("pause-toggle").click();
    const n = await slideCount(page);
    if (f === "05-tiny.csv") expect(n).toBeLessThanOrEqual(6);
    for (let i = 0; i < n; i++) {
      const t = await page.getByTestId("slide-status").textContent();
      expect(t).not.toMatch(/NaN|undefined|Infinity/);
      expect(t).not.toMatch(/ghost/i);
      if (i < n - 1) await page.keyboard.press("ArrowRight");
    }
    await page.getByRole("button", { name: "Close story" }).click();
  }
});

test("large pastes are parsed in a Web Worker", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "same code path");
  const base = fixture("06-large-300.csv").trim().split("\n");
  // 3,000 data rows (~180 KB, above the 150 KB worker threshold), unique companies per copy
  const rows = [base[0]];
  for (let k = 0; k < 10; k++) for (const line of base.slice(1)) rows.push(line.replace(/^([^,]+)/, `$1 ${k}`));
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  await page.goto("/make");
  await page.getByTestId("paste-input").fill(rows.join("\n"));
  await page.getByTestId("continue").click();
  await expect(page.getByRole("heading", { name: /applications/ })).toContainText(/^2,?99\d|^3,?000/);
  expect(workers.length).toBe(1);
});

test("landing carousel: arrows change the caption; the front card opens its sample", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // no auto-rotation, so the front card is stable
  await page.goto("/");
  const caption = page.locator('[aria-live="polite"] p').first();
  await expect(caption).toHaveText("The Marathoner");
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(caption).toHaveText("The Closer");
  await page.waitForTimeout(600); // let the ring settle on the new card
  await page.getByRole("link", { name: /Play the Closer sample/ }).first().click();
  await expect(page).toHaveURL(/\/sample\/closer/);
});
