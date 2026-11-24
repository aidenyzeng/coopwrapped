# Co-op Wrapped

Turn a co-op / internship application spreadsheet into a short, personalized, animated story — and a card worth posting on LinkedIn or X.

- **Private by default.** The spreadsheet is parsed and analyzed in the browser. Rows, company names and files never reach a server or analytics.
- **Messy input welcome.** Paste from Google Sheets, Excel or Numbers, or upload a CSV. Columns are detected with confidence scores and can be corrected in one step.
- **Honest numbers.** Current status isn't treated as history, pending applications are never called "ghosted", and every rate shows its denominator.
- **Shareable.** Three card styles × two sizes (1080×1920, 1200×630), optional public replay links with server-rendered Open Graph images, and a "Make your own" ending on every shared replay.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

Production build and checks:

```bash
npm run build && npm start
npm run typecheck
npm test               # unit tests (vitest)
npm run test:e2e       # Playwright, desktop + mobile, against `next start` on :3200 (uses installed Google Chrome)
npm run eval:import    # column-detection accuracy on labeled fixtures + held-out set
```

Other scripts: `npm run fixtures` (regenerate fixtures and sample data), `npm run samples` (render sample cards to `docs/exports` and `public/samples`), `BASE=http://localhost:3200 npm run capture` (screenshot every slide and download real browser exports).

### Configuration

Copy `.env.example` to `.env.local`.

| Variable | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Launch | Printed on every card and used for absolute OG URLs. The default, `coopwrapped.app`, is a **placeholder** — no domain has been registered. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Share links on serverless hosts | Without them, links are written to `.data/shares/*.json`, which only works on a writable disk (local dev, a VM). On Vercel, share-link creation returns 503 until these are set. |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | Optional | A collector that accepts the allowlisted JSON events via `sendBeacon`. Unset → development adapter (in memory, console in dev). |

### Deploying (not done — no credentials were available)

1. Register a domain and set `NEXT_PUBLIC_SITE_URL`.
2. Create an Upstash Redis database and set the two `UPSTASH_*` variables.
3. Deploy to any Node host (e.g. Vercel). `/api/og/[id]` needs the **Node.js runtime** because it uses `@napi-rs/canvas`; `next.config.ts` already marks it external and traces `assets/fonts` into the function.
4. Re-run Lighthouse against the deployed URL — the numbers below were measured on localhost.

## Architecture

```
src/lib/
  model/types.ts          Typed application model with per-field provenance
  import/                 parse.ts (Papa Parse, TSV/CSV/semicolon) → detect.ts (confidence-based column detection)
                          → normalize.ts (status, dates, flags, company keys) → build.ts (applications + diagnostics)
                          run.ts / worker.ts (Web Worker for inputs > 150 KB)
  analytics/metrics.ts    Pure metric functions (no I/O, injected reference date)
  analytics/local.ts      Local-only helpers that touch company names (never public)
  persona/personas.ts     Ordered, deterministic persona rules + "why" explanations
  story/plan.ts           Story-planning engine → slide type, required metrics, copy variant, duration, theme, seed
  playback/machine.ts     Pure playback state machine (pause reasons as a set)
  card/illustration.ts    Persona "stamp" illustration system as primitive shapes (→ SVG and canvas)
  card/render.ts          One canvas renderer for card previews, PNG exports, slide posters and OG images
  share/payload.ts        Versioned, allowlisted public summary + strict validator
  share/stats.ts          Allowlisted card stats (never zero offers / misleading values)
  share/captions.ts       Professional + playful caption suggestions from the public summary only
  events/track.ts         Privacy-preserving event interface with per-event prop schemas
  server/store.ts         Share-link storage (Upstash REST or file), hashed delete tokens, rate limit
  server/canvas.ts        Node-side card rendering via @napi-rs/canvas
src/components/           Story player, slides, share sheet, import flow
src/app/                  /, /make, /sample/[id], /r/[id], /how-it-works, /api/share, /api/share/[id], /api/og/[id]
```

Data flow: `text → parseTable → detectColumns → buildApplications (+issues) → computeMetrics → selectPersona → planStory → StoryPlayer`. The share card is always rendered from `PublicSummaryV1` — the same object a share link would store — so the preview is exactly what can become public.

### Key decisions and tradeoffs

- **Canvas renderer shared by browser and server** instead of DOM screenshots (html-to-image) or a separate Satori layout. Exports are pixel-exact at the target size, fonts are guaranteed loaded (`document.fonts.load` before drawing), and OG images can't drift from exports. Cost: card layouts are imperative canvas code, and the OG route needs a native module (Node runtime only).
- **Fonts are self-hosted** (Bricolage Grotesque variable woff2 for the web; static TTFs for the server). They're registered under their real family names because Skia collapses several weights registered under one alias.
- **Share links store a summary, not a token in the URL.** Server-side social previews need server-side data (URL fragments never reach the server), and storage enables deletion. The stored summary is integers + enums only — no strings from the spreadsheet can be stored even by a modified client.
- **No accounts, no database.** A key-value store is the only infrastructure, used only for opt-in links.
- **Landing page is a server component with a CSS-only animated reel** so it ships almost no JS; Motion loads only on story routes.
- **Exact duplicates are counted once by default** (with a visible warning and a toggle); near-duplicates are only flagged, because re-applying to the same company is normal.

## Metric semantics

See `/how-it-works` in the app for the user-facing version.

- *Applications* = rows with a company name, minus exact duplicates (unless the user opts to keep them).
- *Companies* are grouped only by case/spacing/punctuation/`&`/legal suffix. "Meta Materials" ≠ "Metal Works"; "RBC" ≠ "Royal Bank of Canada".
- *Status is current state.* Outcome slides say so and show `n / denominator`; unknown and blank statuses are excluded from the denominator and the slide says how many.
- *Interview history* is claimed only from an interview milestone column, a current "interviewing" status, or status wording like "rejected after interview". Accepted ⇒ offer, but not ⇒ recorded interview.
- *No recorded response* replaces "ghosted". `waitingAged` (30+ days) is `null`, not 0, when dates are missing.
- *Rhythm* needs ≥5 readable dates covering ≥50% of rows.
- No industry classifications or peer benchmarks are generated.

## Measured results

All measurements taken on 2026-11-24 on a local production build (`next start`), macOS, Chrome.

**Tests:** 111 unit tests (vitest) and 23 end-to-end tests (Playwright; desktop + Pixel 7 emulation; 2 tests are intentionally desktop- or mobile-only, so 23 passed and 3 skipped in the full matrix) — all passing.

**Import accuracy** (column-level, against hand-labeled mappings — `docs/import-eval*.md`):

| Set | First run | After fixes |
|---|---|---|
| 11 fixtures (`fixtures/`) — used for tuning | 46/48 (95.8%) | 48/48 (100%) |
| 4 held-out files (`fixtures/holdout/`), written after tuning | **18/21 (85.7%)** | 21/21 (100%) |

The held-out first run is the most honest number. After it was recorded, the two root causes it exposed were fixed (yes/no columns winning a "Response?" status alias; flag columns assigned a specific milestone with no header evidence), so the "after" column is no longer held out. Both sets were written by the same author as the detector.

**Import speed:** 300 rows parse + normalize in ~4 ms in Node (`scripts/eval-import.ts --verbose`); inputs over 150 KB move to a Web Worker.

**Lighthouse (mobile preset, simulated throttling, median of 3 runs):**

| Page | Perf runs | Perf | A11y | Best practices | SEO | LCP | TBT | CLS | JS transferred |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 100, 100, 100 | 100 | 100 | 100 | 100 | 0.8 s | 10 ms | 0 | 245 KB |
| `/sample/marathoner` (story) | 100, 100, 100 | 100 | 100 | 100 | 100 | 0.8 s | 10 ms | 0 | 239 KB |
| `/make` | 100, 100, 100 | 100 | 100 | 100 | 100 | 0.8 s | 10 ms | 0 | 245 KB |
| `/r/[id]` (replay) | 100, 100, 100 | 100 | 100 | 100 | 60 | 0.6 s | 10 ms | 0 | 218 KB |

Replay SEO is 60 because shared recaps are intentionally `noindex`. Localhost has no real network latency even under simulated throttling; re-measure after deploying.

## Known limitations

- Not deployed; the card URL `coopwrapped.app` is a placeholder.
- Share-link deletion uses a token kept in the creator's `localStorage`. Clearing site data or switching devices means the link can't be deleted until it expires (1 year).
- The file-backed share store and its rate limiter are per-process; use Upstash in production.
- `.xlsx` / `.numbers` files aren't parsed — users paste cells or export CSV (the UI says so).
- Status vocabulary and copy are English-only. Two-digit years are assumed to be 20xx.
- Visual QA and E2E ran in Chrome only (desktop + Android emulation). Safari/Firefox, and the native share sheet on real phones, are untested.
- Web Share with files isn't available in every browser; those users get a download instead.
- With reduced motion, animations are removed but slides still auto-advance (pause is always available).
- Fixtures and held-out files are synthetic; real trackers will surface new header and status wording.
