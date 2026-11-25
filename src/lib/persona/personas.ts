import type { Metrics } from "../analytics/metrics";

/**
 * Deterministic persona rules, checked in priority order; the first match wins,
 * which also resolves ties. Every persona is supportive. Each rule yields a
 * single integer `param` so the persona sentence can be rebuilt from a public
 * summary without any private data.
 */

export const PERSONA_IDS = [
  "closer", "contender", "first_move", "magnet", "marathoner", "optimist", "sprinter", "metronome", "comeback", "sharpshooter", "builder",
] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export interface PersonaDef {
  id: PersonaId;
  name: string;
  /** one-line rule shown in "Why this persona?" */
  rule: string;
  match: (m: Metrics) => number | null; // returns param when matched
  sentence: (param: number, total: number) => string;
  /** palette slot used by cards/illustrations */
  tone: "tomato" | "ultra" | "lime" | "pink" | "mint" | "sun";
}

const s = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export const PERSONAS: PersonaDef[] = [
  {
    id: "closer",
    name: "The Closer",
    rule: "At least one accepted offer is recorded.",
    match: (m) => (m.offers.accepted > 0 ? m.offers.accepted : null),
    sentence: (_p, total) => `${s(total, "application")} in, and an offer signed. That’s the whole point.`,
    tone: "sun",
  },
  {
    id: "contender",
    name: "The Contender",
    rule: "At least one offer is recorded (none marked accepted yet).",
    match: (m) => (m.offers.total > 0 ? m.offers.total : null),
    sentence: (p, total) => `${s(p, "offer")} from ${s(total, "application")}. The next move is yours.`,
    tone: "tomato",
  },
  {
    id: "first_move",
    name: "The Opening Move",
    rule: "Fewer than 8 applications, so we keep it simple.",
    match: (m) => (m.total < 8 ? m.total : null),
    sentence: (p) => `${s(p, "application")} out the door. Every search starts with a first send.`,
    tone: "mint",
  },
  {
    id: "magnet",
    name: "The Interview Magnet",
    rule: "3+ applications reached a recorded interview, and at least 1 in 5 did.",
    match: (m) =>
      m.interviews.recorded >= 3 && m.interviews.recorded / m.total >= 0.2 ? m.interviews.recorded : null,
    sentence: (p, total) => `${p} of ${total} applications reached a recorded interview. People wanted to talk.`,
    tone: "pink",
  },
  {
    id: "marathoner",
    name: "The Marathoner",
    rule: "75 or more applications.",
    match: (m) => (m.total >= 75 ? m.total : null),
    sentence: (p) => `${p} applications. The job portal knows you by name now.`,
    tone: "ultra",
  },
  {
    id: "optimist",
    name: "The Optimist",
    rule: "At least 70% of applications have no recorded response yet.",
    match: (m) => (m.statusKnown >= 8 && m.waiting / m.statusKnown >= 0.7 ? m.waiting : null),
    sentence: (p) => `${p} applications still out in the world. The inbox owes you a few replies.`,
    tone: "lime",
  },
  {
    id: "sprinter",
    name: "The Sprinter",
    rule: "15+ dated applications, with at least 40% sent inside a single 7-day stretch.",
    match: (m) => (m.dates && m.dates.dated >= 15 && m.dates.burstShare >= 0.4 ? m.dates.maxIn7Days : null),
    sentence: (p) => `${p} applications in one 7-day stretch. Deadlines feared you.`,
    tone: "tomato",
  },
  {
    id: "metronome",
    name: "The Metronome",
    rule: "Applications in 6+ different weeks, with no single week dominating.",
    match: (m) => (m.dates && m.dates.activeWeeks >= 6 && m.dates.burstShare < 0.3 ? m.dates.activeWeeks : null),
    sentence: (p) => `Applications in ${p} different weeks. Steady beats frantic.`,
    tone: "mint",
  },
  {
    id: "comeback",
    name: "The Comeback Kid",
    rule: "Applied to the same company 3 or more times.",
    match: (m) => (m.repeats.maxPerCompany >= 3 ? m.repeats.maxPerCompany : null),
    sentence: (p) => `Applied to one company ${p} times. Persistence is a skill.`,
    tone: "lime",
  },
  {
    id: "sharpshooter",
    name: "The Sharpshooter",
    rule: "30 or fewer applications, and at least half got a recorded response.",
    match: (m) =>
      m.total <= 30 && m.statusKnown >= 8 && m.responded / m.statusKnown >= 0.5 ? m.responded : null,
    sentence: (p, total) => `${p} of ${total} applications got a recorded response. Picky, and it showed.`,
    tone: "ultra",
  },
  {
    id: "builder",
    name: "The Builder",
    rule: "Default: none of the rules above matched.",
    match: (m) => m.companies,
    sentence: (p, total) => `${s(total, "application")} across ${s(p, "company", "companies")}. Brick by brick.`,
    tone: "pink",
  },
];

export const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<PersonaId, PersonaDef>;

export interface PersonaResult {
  id: PersonaId;
  name: string;
  sentence: string;
  param: number;
  /** "Why this persona?" — the matched rule and the rules checked before it */
  why: { matched: string; skipped: { name: string; rule: string }[] };
}

export function selectPersona(m: Metrics): PersonaResult {
  const skipped: { name: string; rule: string }[] = [];
  for (const p of PERSONAS) {
    const param = p.match(m);
    if (param !== null) {
      return { id: p.id, name: p.name, sentence: p.sentence(param, m.total), param, why: { matched: p.rule, skipped } };
    }
    skipped.push({ name: p.name, rule: p.rule });
  }
  throw new Error("unreachable: builder always matches");
}

export function personaSentence(id: PersonaId, param: number, total: number) {
  return PERSONA_BY_ID[id].sentence(param, total);
}
