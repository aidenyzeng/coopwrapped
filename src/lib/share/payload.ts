import { PERSONA_IDS, type PersonaId } from "../persona/personas";
import { STAT_KEYS, type StatValue } from "./stats";

/**
 * Public share payload. This is the ONLY data that ever leaves the browser.
 * Versioned, allowlisted, integers + enums only — no strings from the spreadsheet.
 */
export const CARD_STYLES = ["achievement", "comedy", "minimal"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export interface PublicSummaryV1 {
  v: 1;
  persona: PersonaId;
  personaParam: number;
  total: number;
  stats: StatValue[]; // 0–3
  style: CardStyle;
  seed: number;
}

export const MAX_PAYLOAD_BYTES = 1024;
const MAX_COUNT = 5000;

export type ValidationResult = { ok: true; value: PublicSummaryV1 } | { ok: false; error: string };

const isInt = (x: unknown, min = 0, max = MAX_COUNT): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

/** Strict validation: rejects unknown keys anywhere, so nothing extra can ride along. */
export function validateSummary(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "not an object" };
  const o = input as Record<string, unknown>;
  const allowed = ["v", "persona", "personaParam", "total", "stats", "style", "seed"];
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length) return { ok: false, error: `unexpected field(s): ${extra.join(", ")}` };
  if (o.v !== 1) return { ok: false, error: "unsupported version" };
  if (typeof o.persona !== "string" || !(PERSONA_IDS as readonly string[]).includes(o.persona)) return { ok: false, error: "bad persona" };
  if (!isInt(o.total, 1)) return { ok: false, error: "bad total" };
  if (!isInt(o.personaParam, 0)) return { ok: false, error: "bad personaParam" };
  if (!isInt(o.seed, 0, 2 ** 32 - 1)) return { ok: false, error: "bad seed" };
  if (typeof o.style !== "string" || !(CARD_STYLES as readonly string[]).includes(o.style)) return { ok: false, error: "bad style" };
  if (!Array.isArray(o.stats) || o.stats.length > 3) return { ok: false, error: "bad stats" };
  const seen = new Set<string>();
  const stats: StatValue[] = [];
  for (const s of o.stats) {
    if (typeof s !== "object" || s === null || Array.isArray(s)) return { ok: false, error: "bad stat" };
    const so = s as Record<string, unknown>;
    if (Object.keys(so).some((k) => !["key", "value", "of"].includes(k))) return { ok: false, error: "bad stat field" };
    if (typeof so.key !== "string" || !(STAT_KEYS as readonly string[]).includes(so.key) || seen.has(so.key)) return { ok: false, error: "bad stat key" };
    if (!isInt(so.value, 0)) return { ok: false, error: "bad stat value" };
    if (so.of !== undefined && (!isInt(so.of, 1) || (so.of as number) < (so.value as number))) return { ok: false, error: "bad stat denominator" };
    seen.add(so.key);
    stats.push(so.of === undefined ? { key: so.key as StatValue["key"], value: so.value as number } : { key: so.key as StatValue["key"], value: so.value as number, of: so.of as number });
  }
  const value: PublicSummaryV1 = {
    v: 1,
    persona: o.persona as PersonaId,
    personaParam: o.personaParam as number,
    total: o.total as number,
    stats,
    style: o.style as CardStyle,
    seed: o.seed as number,
  };
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_PAYLOAD_BYTES) return { ok: false, error: "too large" };
  return { ok: true, value };
}

/** Parse a raw request body string with a byte cap before JSON.parse. */
export function parseSummaryBody(body: string): ValidationResult {
  if (body.length > MAX_PAYLOAD_BYTES * 2) return { ok: false, error: "too large" };
  try {
    return validateSummary(JSON.parse(body));
  } catch {
    return { ok: false, error: "invalid json" };
  }
}
