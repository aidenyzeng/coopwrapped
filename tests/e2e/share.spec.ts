import { expect, test } from "@playwright/test";
import { goToEnd, pngSize } from "./helpers";

test("share link: exact public preview → create → sanitized replay + OG → make your own → delete", async ({ page, request }) => {
  await page.goto("/sample/optimist");
  await goToEnd(page);
  await page.getByTestId("open-share").click();
  const preview = page.getByTestId("public-preview");
  await expect(preview).toContainText("The Optimist");
  await page.getByTestId("create-link").click();
  await page.getByTestId("confirm-create-link").click();
  const url = (await page.getByTestId("share-link").textContent())!;
  const id = url.split("/r/")[1];
  expect(id).toMatch(/^[A-Za-z0-9]{10}$/);

  // server-rendered metadata (no URL fragments) points at a server OG image
  const html = await (await request.get(`/r/${id}`)).text();
  expect(html).toContain(`/api/og/${id}`);
  expect(html).toMatch(/<meta property="og:title" content="64 applications/);
  // nothing from the spreadsheet leaks into the public page
  for (const name of ["Northwind", "Maple Byte", "Kestrel", "Co-op", "Intern"]) expect(html.replace(/Co-wrapped|co-op search|Co-op season|co-op/gi, "")).not.toContain(name);

  const og = await request.get(`/api/og/${id}`);
  expect(og.headers()["content-type"]).toBe("image/png");
  expect(pngSize(Buffer.from(await og.body()))).toEqual({ w: 1200, h: 630 });

  // replay → CTA → creation
  const replay = await page.context().newPage();
  await replay.goto(`/r/${id}`);
  await goToEnd(replay);
  await replay.getByTestId("make-your-own").click();
  await expect(replay).toHaveURL(/\/make\?via=replay/);
  const ev = await replay.evaluate(() => JSON.stringify((window as unknown as { __cwEvents?: unknown[] }).__cwEvents));
  expect(ev).toContain("replay_create_start");
  expect(ev).toContain(id); // referral attribution = random share id only

  // delete
  await page.getByTestId("delete-link").click();
  await expect(page.getByTestId("share-notice")).toContainText("deleted");
  expect((await request.get(`/r/${id}`)).status()).toBe(404);
  expect((await request.get(`/api/og/${id}`)).status()).toBe(404);
});

test("share API rejects non-allowlisted payloads", async ({ request }) => {
  const base = { v: 1, persona: "builder", personaParam: 3, total: 10, stats: [], style: "minimal", seed: 1 };
  const bad = await request.post("/api/share", { data: { ...base, company: "Acme" } });
  expect(bad.status()).toBe(400);
  const big = await request.post("/api/share", { data: { ...base, pad: "x".repeat(5000) } });
  expect(big.status()).toBe(413);
  const wrongDelete = await request.delete("/api/share/AAAAAAAAAA", { headers: { "x-delete-token": "nope" } });
  expect(wrongDelete.status()).toBe(404);
});
