import { WEEKDAYS, monthName, shortDate, type Metrics } from "../analytics/metrics";
import { PERSONA_BY_ID, type PersonaId, type PersonaResult } from "../persona/personas";
import { rng, type ThemeId } from "../design/tokens";
import type { PublicSummaryV1 } from "../share/payload";
import { statDisplay } from "../share/stats";

export type SlideType = "intro" | "volume" | "rhythm" | "outcomes" | "observation" | "persona" | "ending" | "highlights" | "summary" | "cta";

export type Viz =
  | { kind: "tally"; count: number }
  | { kind: "weekly"; weeks: { start: string; count: number }[]; highlight: number }
  | { kind: "outcomes"; rows: { label: string; count: number; tone: "accent" | "fg" | "muted" }[]; denominator: number }
  | { kind: "stamp"; persona: PersonaId }
  | { kind: "burst"; persona: PersonaId }
  | { kind: "ratio"; part: number; whole: number }
  | { kind: "postmark" }
  | { kind: "seal"; persona: PersonaId }
  | { kind: "stats"; items: { value: string; label: string }[] };

export interface SlideContent {
  eyebrow: string;
  hero?: string;
  heroLabel?: string;
  headline: string;
  body?: string;
  footnote?: string;
  viz?: Viz;
}

export interface SlideSpec {
  id: string;
  type: SlideType;
  /** metric paths this slide depends on (for eligibility tests & debugging) */
  requires: string[];
  variant: string;
  durationMs: number; // Infinity = waits for the user
  theme: ThemeId;
  seed: number;
  content: SlideContent;
}

export interface StoryPlan {
  seed: number;
  slides: SlideSpec[];
}

export interface PlanInput {
  metrics: Metrics;
  persona: PersonaResult;
  seed: number;
  /** most-applied company — only used when showCompanyNames is on */
  topCompany?: string;
  showCompanyNames?: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const pl = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);

const THEME_CYCLE: ThemeId[] = ["ink", "tomato", "paper", "ultra", "lime", "pink", "mint", "sun"];

function assignThemes(slides: Omit<SlideSpec, "theme">[], personaTheme: ThemeId, seed: number): SlideSpec[] {
  const r = rng(seed);
  const offset = Math.floor(r() * THEME_CYCLE.length);
  let prev: ThemeId | null = null;
  return slides.map((s, i) => {
    let theme: ThemeId;
    if (s.type === "persona" || s.type === "summary") theme = personaTheme;
    else if (s.type === "intro") theme = "ink";
    else {
      theme = THEME_CYCLE[(offset + i) % THEME_CYCLE.length];
      if (theme === prev || theme === personaTheme) theme = THEME_CYCLE[(offset + i + 3) % THEME_CYCLE.length];
    }
    if (theme === prev) theme = theme === "paper" ? "ink" : "paper";
    prev = theme;
    return { ...s, theme };
  });
}

function dateRange(m: Metrics) {
  if (!m.dates) return "This season";
  const a = monthName(m.dates.first.slice(0, 7)).slice(0, 3);
  const b = monthName(m.dates.last.slice(0, 7)).slice(0, 3);
  const ya = m.dates.first.slice(0, 4);
  const yb = m.dates.last.slice(0, 4);
  if (a === b && ya === yb) return `${monthName(m.dates.first.slice(0, 7))} ${ya}`;
  return ya === yb ? `${a} – ${b} ${yb}` : `${a} ${ya} – ${b} ${yb}`;
}

export function volumeCopy(total: number): { variant: string; headline: string } {
  if (total < 8) return { variant: "tiny", headline: "Small sample. Big first step." };
  if (total < 30) return { variant: "focused", headline: "Quality over quantity. Mostly." };
  if (total < 75) return { variant: "serious", headline: "That’s a serious search." };
  if (total < 150) return { variant: "big", headline: "That’s a lot of “I’m excited to apply.”" };
  return { variant: "huge", headline: "At this point the portal should be paying you." };
}

export function planStory(input: PlanInput): StoryPlan {
  const { metrics: m, persona, seed } = input;
  const slides: Omit<SlideSpec, "theme">[] = [];
  const r = rng(seed ^ 0x9e3779b9);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  // 1. Intro — always
  slides.push({
    id: "intro",
    type: "intro",
    requires: ["total"],
    variant: m.dates ? "dated" : "undated",
    durationMs: 3800,
    seed: seed + 1,
    content: {
      eyebrow: dateRange(m),
      headline: "Your co-op search,",
      body: pick(["wrapped.", "in review.", "on the record."]),
    },
  });

  // 2. Volume — always
  const vc = volumeCopy(m.total);
  const volBody: string[] = [];
  if (m.companies > 1) volBody.push(`across ${fmt(m.companies)} ${pl(m.companies, "company", "companies")}`);
  if (m.roles >= 3) volBody.push(`for ${fmt(m.roles)} different role titles`);
  slides.push({
    id: "volume",
    type: "volume",
    requires: ["total", "companies"],
    variant: vc.variant,
    durationMs: 5600,
    seed: seed + 2,
    content: {
      eyebrow: "The volume",
      hero: fmt(m.total),
      heroLabel: pl(m.total, "application"),
      headline: vc.headline,
      body: volBody.length ? `Sent ${volBody.join(", ")}.` : undefined,
      viz: { kind: "tally", count: m.total },
    },
  });

  // 3. Rhythm — only with enough dated rows and more than one week of activity
  if (m.dates && m.dates.weekly.length >= 2 && m.dates.busiestWeek.count >= 2) {
    const d = m.dates;
    const sprint = d.burstShare >= 0.4;
    const steady = d.activeWeeks >= 6 && d.burstShare < 0.3;
    const wd = [...d.weekdayCounts];
    const maxWd = Math.max(...wd);
    const second = [...wd].sort((a, b) => b - a)[1];
    const favDay = maxWd >= 3 && maxWd >= second * 1.3 ? WEEKDAYS[wd.indexOf(maxWd)] : null;
    const weeks = d.weekly.slice(-26);
    slides.push({
      id: "rhythm",
      type: "rhythm",
      requires: ["dates.busiestWeek", "dates.weekly"],
      variant: sprint ? "sprint" : steady ? "steady" : "peak",
      durationMs: 6200,
      seed: seed + 3,
      content: {
        eyebrow: "Your busiest week",
        hero: fmt(d.busiestWeek.count),
        heroLabel: `${pl(d.busiestWeek.count, "application")} the week of ${shortDate(d.busiestWeek.start)}`,
        headline: sprint
          ? "Then came the deadline sprint."
          : steady
            ? `${d.activeWeeks} different weeks. You kept showing up.`
            : "Every search has a peak week.",
        body: favDay ? `${favDay} was your go-to day to hit submit.` : undefined,
        footnote: d.coverage < 0.98 ? `Based on ${d.dated} of ${m.total} applications with a readable date.` : undefined,
        viz: { kind: "weekly", weeks, highlight: weeks.findIndex((w) => w.start === d.busiestWeek.start) },
      },
    });
  }

  // 4. Outcomes — only with a status column and enough classified rows
  if (m.hasStatus && m.statusKnown >= 3) {
    const sc = m.statusCounts;
    const offers = sc.offer + sc.accepted + sc.declined;
    const rows = [
      { label: offers === 1 ? "Offer" : "Offers", count: offers, tone: "accent" as const },
      { label: "Interviewing now", count: sc.interviewing, tone: "fg" as const },
      { label: "Assessment / screen", count: sc.screening, tone: "fg" as const },
      { label: "Rejected", count: sc.rejected, tone: "muted" as const },
      { label: "No recorded response", count: sc.applied + sc.no_response, tone: "muted" as const },
      { label: "Withdrawn", count: sc.withdrawn, tone: "muted" as const },
    ].filter((x) => x.count > 0);
    const replyShare = m.responded / m.statusKnown;
    const quietShare = m.waiting / m.statusKnown;
    const variant = replyShare >= 0.5 ? "replies" : quietShare >= 0.7 ? "quiet" : "mixed";
    const notes: string[] = ["Current status only. Earlier stages may not be recorded."];
    if (sc.unknown > 0) notes.push(`${sc.unknown} with an unrecognized status not counted.`);
    if (m.statusBlank > 0) notes.push(`${m.statusBlank} with a blank status not counted.`);
    slides.push({
      id: "outcomes",
      type: "outcomes",
      requires: ["statusCounts", "statusKnown"],
      variant,
      durationMs: 6800,
      seed: seed + 4,
      content: {
        eyebrow: "Where things stand",
        hero: `${fmt(m.responded)}`,
        heroLabel: `of ${fmt(m.statusKnown)} applications have a recorded response`,
        headline:
          variant === "replies"
            ? "More replies than silence."
            : variant === "quiet"
              ? "Mostly quiet so far. That’s the market, not you."
              : "Some replies, some silence. Classic.",
        body:
          m.waitingAged && m.waitingAged > 0
            ? `${fmt(m.waitingAged)} ${pl(m.waitingAged, "has", "have")} had no recorded response for 30+ days.`
            : undefined,
        footnote: notes.join(" "),
        viz: { kind: "outcomes", rows, denominator: m.statusKnown },
      },
    });
  }

  // 5. One distinctive observation — first eligible candidate not already the persona's story
  const obs = observation(input);
  if (obs) slides.push({ ...obs, durationMs: 5600, seed: seed + 5 });

  // 6. Persona — always
  slides.push({
    id: "persona",
    type: "persona",
    requires: ["persona"],
    variant: persona.id,
    durationMs: 7200,
    seed: seed + 6,
    content: {
      eyebrow: "Your search persona",
      headline: persona.name,
      body: persona.sentence,
      viz: { kind: "stamp", persona: persona.id },
    },
  });

  // 7. Ending — celebration only when an offer is actually recorded
  if (m.offers.accepted > 0) {
    slides.push({
      id: "ending",
      type: "ending",
      requires: ["offers.accepted"],
      variant: "accepted",
      durationMs: 5200,
      seed: seed + 7,
      content: { eyebrow: "And then", headline: "You signed.", body: "Offer accepted. Every rejection before this was just routing.", viz: { kind: "burst", persona: persona.id } },
    });
  } else if (m.offers.total > 0) {
    slides.push({
      id: "ending",
      type: "ending",
      requires: ["offers.total"],
      variant: "offer",
      durationMs: 5200,
      seed: seed + 7,
      content: {
        eyebrow: "The plot twist",
        headline: m.offers.total === 1 ? "An offer on the table." : `${m.offers.total} offers on the table.`,
        body: "Whatever you decide, the work got you here.",
        viz: { kind: "burst", persona: persona.id },
      },
    });
  } else if (!m.smallSample) {
    slides.push({
      id: "ending",
      type: "ending",
      requires: ["total"],
      variant: "ongoing",
      durationMs: 5600,
      seed: seed + 7,
      content: {
        eyebrow: "Still going",
        headline: "The search isn’t over.",
        body: `But ${fmt(m.total)} applications is proof you don’t quit. The right “yes” only needs to happen once.`,
        viz: { kind: "seal", persona: persona.id },
      },
    });
  }

  // 8. Summary — always; waits for the user
  slides.push({
    id: "summary",
    type: "summary",
    requires: ["total", "persona"],
    variant: "card",
    durationMs: Infinity,
    seed,
    content: { eyebrow: "Your card", headline: "Share your season" },
  });

  return { seed, slides: assignThemes(slides, PERSONA_BY_ID[persona.id].tone, seed) };
}

function observation(input: PlanInput): Omit<SlideSpec, "theme" | "durationMs" | "seed"> | null {
  const { metrics: m, persona } = input;
  const d = m.dates;
  const cands: (Omit<SlideSpec, "theme" | "durationMs" | "seed"> | null)[] = [
    m.interviews.source === "history" && m.interviews.recorded >= 2 && persona.id !== "magnet"
      ? {
          id: "obs-interviews",
          type: "observation",
          requires: ["interviews.recorded"],
          variant: "interviews",
          content: {
            eyebrow: "Got the call",
            hero: fmt(m.interviews.recorded),
            heroLabel: `of ${fmt(m.total)} applications reached a recorded interview`,
            headline: "Someone read the resume. Then they wanted more.",
            viz: { kind: "ratio", part: m.interviews.recorded, whole: m.total },
          },
        }
      : null,
    m.repeats.maxPerCompany >= 2 && persona.id !== "comeback"
      ? {
          id: "obs-repeat",
          type: "observation",
          requires: ["repeats.maxPerCompany"],
          variant: "repeat",
          content: {
            eyebrow: "Loyalty points",
            hero: `${m.repeats.maxPerCompany}×`,
            heroLabel: input.showCompanyNames && input.topCompany ? `applications to ${input.topCompany}` : "applications to the same company",
            headline: m.repeats.maxPerCompany >= 4 ? "They know your name by now." : "Some companies are worth a second shot.",
            viz: { kind: "postmark" },
          },
        }
      : null,
    d && d.longestStreak >= 3
      ? {
          id: "obs-streak",
          type: "observation",
          requires: ["dates.longestStreak"],
          variant: "streak",
          content: {
            eyebrow: "On a roll",
            hero: `${d.longestStreak}`,
            heroLabel: "days in a row with at least one application",
            headline: d.longestStreak >= 7 ? "A full week without missing a day." : "Momentum is a strategy.",
            viz: { kind: "ratio", part: d.longestStreak, whole: Math.max(d.longestStreak, Math.min(d.spanDays, 60)) },
          },
        }
      : null,
    d && d.weekendCount >= 3 && d.weekendCount / d.dated >= 0.2
      ? {
          id: "obs-weekend",
          type: "observation",
          requires: ["dates.weekendCount"],
          variant: "weekend",
          content: {
            eyebrow: "Off the clock",
            hero: fmt(d.weekendCount),
            heroLabel: `${pl(d.weekendCount, "application")} sent on a weekend`,
            headline: "Saturdays are for cover letters, apparently.",
            viz: { kind: "ratio", part: d.weekendCount, whole: d.dated },
          },
        }
      : null,
    m.roles >= 5
      ? {
          id: "obs-roles",
          type: "observation",
          requires: ["roles"],
          variant: "roles",
          content: { eyebrow: "Range", hero: fmt(m.roles), heroLabel: "different role titles", headline: "Keeping your options wide open.", viz: { kind: "postmark" } },
        }
      : null,
  ];
  return cands.find((c) => c !== null) ?? null;
}

/** Story for a public replay: built from the sanitized summary only. */
export function planReplay(s: PublicSummaryV1): StoryPlan {
  const p = PERSONA_BY_ID[s.persona];
  const vc = volumeCopy(s.total);
  const slides: Omit<SlideSpec, "theme">[] = [
    { id: "intro", type: "intro", requires: [], variant: "replay", durationMs: 3400, seed: s.seed + 1, content: { eyebrow: "A shared recap", headline: "Their co-op search,", body: "wrapped." } },
    {
      id: "volume", type: "volume", requires: ["total"], variant: vc.variant, durationMs: 5200, seed: s.seed + 2,
      content: { eyebrow: "The volume", hero: fmt(s.total), heroLabel: pl(s.total, "application"), headline: vc.headline, viz: { kind: "tally", count: s.total } },
    },
  ];
  if (s.stats.length)
    slides.push({
      id: "highlights", type: "highlights", requires: ["stats"], variant: "stats", durationMs: 5600, seed: s.seed + 3,
      content: { eyebrow: "Highlights", headline: "The numbers they chose to share", viz: { kind: "stats", items: s.stats.map(statDisplay) } },
    });
  slides.push(
    {
      id: "persona", type: "persona", requires: ["persona"], variant: s.persona, durationMs: 6400, seed: s.seed + 6,
      content: { eyebrow: "Search persona", headline: p.name, body: p.sentence(s.personaParam, s.total), viz: { kind: "stamp", persona: s.persona } },
    },
    { id: "summary", type: "summary", requires: [], variant: "card", durationMs: 6000, seed: s.seed, content: { eyebrow: "Their card", headline: "The whole season" } },
    { id: "cta", type: "cta", requires: [], variant: "cta", durationMs: Infinity, seed: s.seed + 9, content: { eyebrow: "Your turn", headline: "What does your search look like?", body: "Paste your tracker. It never leaves your browser." } },
  );
  return { seed: s.seed, slides: assignThemes(slides, p.tone, s.seed) };
}
