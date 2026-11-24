import { PERSONA_BY_ID, personaSentence, type PersonaId } from "../persona/personas";
import type { Metrics } from "../analytics/metrics";
import type { PersonaResult } from "../persona/personas";
import type { CardStyle, PublicSummaryV1 } from "./payload";
import { availableStats, statDisplay, type StatDisplay, type StatKey } from "./stats";
import { siteHost, type ThemeId } from "../design/tokens";

/** Everything a card needs. Built from the public summary so preview == shareable data. */
export interface CardData {
  total: number;
  personaId: PersonaId;
  personaName: string;
  personaSentence: string;
  tone: ThemeId;
  stats: StatDisplay[];
  style: CardStyle;
  seed: number;
  host: string;
  /** optional, local-only line naming a company (off by default; never in public summaries) */
  companyLine?: string;
}

export function summaryFromMetrics(
  m: Metrics,
  persona: PersonaResult,
  selected: StatKey[],
  style: CardStyle,
  seed: number,
): PublicSummaryV1 {
  const avail = availableStats(m);
  const stats = selected
    .map((k) => avail.find((s) => s.key === k))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .slice(0, 3);
  return { v: 1, persona: persona.id, personaParam: persona.param, total: m.total, stats, style, seed };
}

export function cardFromSummary(s: PublicSummaryV1, extra?: { companyLine?: string; host?: string }): CardData {
  const p = PERSONA_BY_ID[s.persona];
  return {
    total: s.total,
    personaId: s.persona,
    personaName: p.name,
    personaSentence: personaSentence(s.persona, s.personaParam, s.total),
    tone: p.tone,
    stats: s.stats.map(statDisplay),
    style: s.style,
    seed: s.seed,
    host: extra?.host ?? siteHost(),
    companyLine: extra?.companyLine,
  };
}
