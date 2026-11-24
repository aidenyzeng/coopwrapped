# Co-wrapped — technical write-up

Co-wrapped turns a student's job-application spreadsheet into a 5–8 slide animated story and a shareable card. This document describes how the importer, analytics, story engine and sharing work, which privacy decisions shaped them, and what was measured. All numbers come from the commands named next to them; nothing is estimated.

## 1. Importer

**Parsing.** Input is either pasted text (Sheets/Excel/Numbers paste as TSV) or a CSV file. `parseTable` picks tab when ≥80% of non-empty lines contain one, otherwise lets Papa Parse guess among `, \t ; |`. Empty rows and columns are dropped, and a leading single-cell "title row" (e.g. *Winter 2026 co-op hunt*) is skipped. A header row is detected if at least a third of its cells match a known alias, or if it contains no dates while the next row does. Users can override this.

**Column detection** (`import/detect.ts`) scores every (column, field) pair from two independent signals:

- *Header aliases*: exact matches score 1.0, substring matches 0.7 (e.g. "Date Applied (mm/dd)" contains "applied").
- *Value profiles*: share of values that parse as dates, known statuses, yes/no flags or role-like titles, plus uniqueness and length.

Agreement between header and values beats either alone. Two rules came directly from failures on held-out data: a column of yes/no values is never a *status* (whatever its header says), and yes/no values alone can't tell us *which* milestone a column records, so milestone flags require header evidence. Fields are then assigned greedily by score with deterministic tie-breaks (score, field priority, column index); only the informational fields (notes, location) can repeat. Company is the only required field — if no column scores, the most company-like text column is proposed with low confidence ("Guess") so the user confirms it.

**Normalization** (`import/normalize.ts`):

- *Status*: ordered regex buckets map free text into `applied, no_response, rejected, screening, interviewing, offer, accepted, declined, withdrawn, unknown`. More specific patterns win ("offer declined" before "offer", "no offer" before "offer"). A bare "declined" is deliberately `unknown` — it could mean either party declined — and the review step asks the user. Wording like "rejected after final round" sets an *implies interview* bit.
- *Dates*: ISO, numeric slash/dot/dash dates, month names with or without a year, and Excel serials. Day/month order is inferred per column: any first part > 12 means day-first; any second part > 12 means month-first; if nothing disambiguates, month-first is assumed and the user is asked to confirm. Missing years are filled with the column's most common explicit year and marked `inferred`.
- *Companies*: a conservative grouping key ignores only case, whitespace, punctuation, `&`/"and" and legal suffixes (Inc, Ltd, LLC, Corp…). There is no fuzzy matching: "Meta Materials" and "Metal Works Inc" stay separate, as do "RBC" and "Royal Bank of Canada". Merges are reported to the user.

**Provenance.** Every field on an `Application` is `{ value, raw, provenance: direct | normalized | inferred | missing, note? }`, so the UI and tests can tell what came straight from the sheet ("Applied"), what was normalized ("Rejected 😭" → rejected), and what was assumed (a year).

**Diagnostics.** The importer returns typed issues — missing company, unknown status (with an override key), unreadable dates, ambiguous dates, future dates, exact duplicates, possible duplicates, merged spellings. Exact duplicates (same company key, role, date and status) are counted once by default, but the review step says so and offers a toggle. Near-duplicates (same company and role, different details) are only flagged, because re-applying is normal.

**Performance.** Inputs over 150 KB (roughly 2,000+ rows) are parsed in a module Web Worker so the main thread stays responsive. Below that, a worker's startup cost outweighs the benefit — 300 rows take ~4 ms in Node.

## 2. Analytics

`analytics/metrics.ts` is pure: applications plus an injected reference date in, a `Metrics` object out. The semantic rules are the core of the product's trustworthiness:

| Situation | What we say | What we never say |
|---|---|---|
| Status column only | "4 interviewing now" (current stage) | "4 of 128 reached an interview" |
| Interview column, or wording like "rejected after interview" | "13 of 128 applications reached a recorded interview" | An interview for an accepted offer with no record |
| Applied/pending status | "no recorded response" — with a "30+ days" count only when dates exist | "ghosted" |
| Unknown or blank statuses | excluded from the denominator, and the slide says how many | silently counted as anything |
| < 5 readable dates, or < 50% of rows dated | no rhythm slide | a "busiest week" from 2 data points |
| Zero offers | supportive "still going" ending; the offers stat isn't offered | "0 offers" on a card |

`waitingAged` is `null` (unknown), not `0`, when there are no dates. Repeat-application counts use the company key only. No industry classifications or peer comparisons are produced anywhere.

## 3. Personas

Eleven rules, checked in a fixed order; the first match wins, which also resolves ties deterministically. Rate-based personas require a minimum denominator (≥8 classified statuses) so tiny samples don't get claims like "Sharpshooter" from 3 of 4. Fewer than 8 applications yields *The Opening Move* unless an offer is recorded. Each rule returns one integer parameter so the supporting sentence ("47 applications still out in the world…") can be rebuilt from the public summary without private data. "Why this persona?" (in the share sheet and on `/how-it-works`) shows the matched rule and the rules checked before it. Unit tests assert the persona copy contains no deficit language ("only", "failed", "0%"), and that each sample dataset produces the persona it's labeled with.

## 4. Story engine

`story/plan.ts` turns metrics + persona into a `StoryPlan`. Each `SlideSpec` has a type, the metric paths it requires, a copy variant chosen from stat ranges (e.g. volume: *tiny / focused / serious / big / huge*), a duration (∞ for slides that wait for the user), a theme, and a deterministic seed derived from aggregate metrics only. The sequence is: intro → volume → rhythm (if dates allow) → outcomes (if statuses allow) → one distinctive observation (first eligible of interviews, repeat company, streak, weekend applications, role range — skipping whatever the persona already covers) → persona → ending (celebration only if an offer is recorded; supportive otherwise; omitted for tiny samples) → summary card. Themes rotate from a seeded offset, never repeat back-to-back, and the persona/summary slides use the persona's color. Tests run every fixture through the planner and assert 5–8 slides, no `NaN`/`undefined`/`Infinity`, no "ghost", and correct eligibility.

**Playback** is a pure reducer (`playback/machine.ts`). Pausing is a *set of reasons* — `user`, `hold`, `hidden`, `dialog` — and time advances only via `TICK` events when the set is empty, so a hidden tab can't resume a story that the share dialog paused. Ticks are clamped to 250 ms, so a throttled background timer can't skip slides. Navigation clears a gesture hold but keeps an explicit pause. The view layer adds rAF ticks, `visibilitychange`, keyboard (←/→, Space/K), tap zones (left 30% back), horizontal swipe, and press-and-hold (220 ms). Reduced motion removes all enter animations and count-ups.

## 5. Visual identity and cards

The identity is editorial and postal: oversized Bricolage Grotesque numerals, Instrument Serif italics, eight bold flat colors, and a persona illustration system of perforated "postage stamps" with a geometric glyph per persona plus a wavy postmark motif. Illustrations are defined once as primitive shapes in a 100×100 box and rendered both to SVG (story) and canvas (cards).

All cards — previews, PNG exports, slide posters and Open Graph images — come from one canvas renderer (`card/render.ts`). In the browser, it draws at native export resolution after `document.fonts.load()` and the preview is CSS-scaled, so the preview is the export. On the server, `@napi-rs/canvas` runs the same code with the same fonts. Three compositions (Achievement, Comedy, Minimal) × two sizes (1080×1920, 1200×630) were exported from a real browser through the UI and their PNG headers checked in E2E tests. Every one of the 18 sample exports and every slide of the three sample stories was inspected at mobile and desktop sizes. That review led to these fixes: an unreadable blue accent on the dark Minimal card, dead space on the Comedy layouts, orphaned last words, dates breaking across lines, confetti colliding with text, under-filled observation/ending slides, and a review table that hid its dropdowns on phones.

## 6. Privacy decisions

- The spreadsheet never leaves the tab: no upload endpoint exists for it, and nothing is persisted.
- The card is rendered *from* `PublicSummaryV1` (persona id, persona parameter, total, ≤3 allowlisted integer stats, style, seed). A strict validator rejects unknown keys at every level, strings, floats, out-of-range numbers and oversized bodies (1 KB). The only optional string, a "Most applied: X" company line, is off by default, can't be represented in the summary, and is never sent anywhere.
- Share links require an explicit "Create share link" press **and** a confirmation that shows exactly what will be stored. Links get a random 10-character id; the deletion token is returned once and only its SHA-256 hash is stored. Creation is rate-limited (10/hour per hashed IP). Stored summaries are re-validated on read, and links expire after a year.
- Open Graph images and `og:*` tags are generated server-side from the stored summary (not URL fragments, which crawlers never see).
- Analytics events have per-event allowlisted schemas (enums, booleans, clamped integers). Anything else is dropped before it reaches an adapter. Referral attribution uses only the random share id, held in `sessionStorage`. "Export" and "share action" events record button use only — they're not treated as evidence that anything was posted.

## 7. Measured results

Measured 2026-11-24 against a local production build (`next start`) in Chrome on macOS.

- **Unit tests:** 111 passing (normalization, import diagnostics, metric semantics, persona rules, story eligibility, payload privacy, playback machine, analytics sanitization).
- **E2E (Playwright):** 23 passing across desktop (1280×860) and Pixel 7 emulation: paste → review → correct mapping → story → export at both sizes; all styles × sizes; per-slide export; pause, hold, tap, keyboard, swipe, background tab; reduced motion; tiny/missing-data stories with no NaN or "ghost"; share link → sanitized replay HTML + OG PNG → "Make your own" with referral → deletion → 404; API rejection of non-allowlisted payloads; Web Worker path for a 3,000-row paste; and a check that no raw cell values appear in analytics events.
- **Import accuracy:** 48/48 columns on the 11 tuning fixtures (95.8% on the first run). The held-out set scored **18/21 (85.7%)** on its first run, then 21/21 after the two root causes were fixed. See `docs/import-eval*.md`.
- **Lighthouse mobile** (median of 3): 100 performance and 100 accessibility on the landing page, a sample story, `/make` and a replay page. LCP 0.6–0.8 s, TBT 10 ms, CLS 0. Raw reports are in `docs/lighthouse/`. These are localhost numbers and should be re-measured after deploying.

## 8. What I'd do next

Deploy with a real domain and Upstash, then re-measure. Collect anonymized *header strings only* (opt-in) to grow the alias list from real sheets. Test Safari and Firefox, and the native share sheet on real phones. Add `.xlsx` parsing, and localized status vocabularies.
