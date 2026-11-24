import { PERSONA_BY_ID } from "../persona/personas";
import type { PublicSummaryV1 } from "./payload";
import { statDisplay } from "./stats";

export type CaptionTone = "professional" | "playful";

/**
 * Caption suggestions built only from the public summary. They describe what
 * the stats say — no invented achievements, no implied offers.
 */
export function captionSuggestions(s: PublicSummaryV1, url: string): Record<CaptionTone, string[]> {
  const p = PERSONA_BY_ID[s.persona];
  const offer = s.persona === "closer" || s.persona === "contender";
  const statLines = s.stats.map((st) => {
    const d = statDisplay(st);
    return `${d.value} ${d.label}`;
  });
  const statSentence = statLines.length ? ` ${statLines.join(" · ")}.` : "";

  const professional = [
    offer
      ? s.persona === "closer"
        ? `My co-op search, by the numbers: ${s.total} applications and one signed offer. Grateful to everyone who reviewed a resume or ran a mock interview with me.${statSentence}`
        : `My co-op search, by the numbers: ${s.total} applications and an offer on the table. Grateful for everyone who helped along the way.${statSentence}`
      : `My co-op search so far: ${s.total} applications and counting.${statSentence} Still looking — if your team is hiring, I’d love to connect.`,
    `I turned my application tracker into a recap. Turns out I’m “${p.name}.”${statSentence}`,
  ];

  const playful = [
    `${s.total} applications later, the spreadsheet has spoken: I am ${p.name}.`,
    offer
      ? `Co-op season recap: ${s.total} applications, and a plot twist worth waiting for. The spreadsheet can rest now.`
      : `Co-op season recap: ${s.total} applications, mass-produced cover letters, unwavering optimism.`,
  ];

  const withUrl = (t: string) => `${t}\n\nMade with Co-wrapped → ${url}`;
  return { professional: professional.map(withUrl), playful: playful.map(withUrl) };
}
