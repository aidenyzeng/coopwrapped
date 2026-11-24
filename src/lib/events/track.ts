/**
 * Minimal privacy-preserving event interface.
 *
 * - Every event has a fixed, allowlisted property schema of enums, booleans and
 *   bucketed numbers. Anything else is dropped before it reaches an adapter, so
 *   raw rows, company names, captions or URLs can't leak by accident.
 * - "export" and "share_action" record button use only. They do NOT mean a post
 *   was published — we can't and don't observe that.
 * - With no provider configured, events go to a development adapter (console +
 *   in-memory buffer used by tests).
 */

type Bucket = "1-7" | "8-29" | "30-74" | "75-149" | "150+";

export interface EventProps {
  landing_cta: { position: "hero" | "footer" };
  sample_selected: { sample: "marathoner" | "closer" | "optimist"; from: "landing" | "make" | "replay" };
  import_completed: { source: "paste" | "file" | "sample"; rows: Bucket; columns_corrected: boolean; warnings: number };
  import_failed: { source: "paste" | "file"; reason: "empty" | "no_company" | "too_large" | "parse_error" };
  story_completed: { slides: number; mode: "own" | "sample" | "replay" };
  export: { style: "achievement" | "comedy" | "minimal" | "slide"; size: "story" | "landscape" };
  share_action: { method: "web_share" | "download" | "copy_caption" | "copy_link" | "x_intent" | "linkedin_intent"; style?: "achievement" | "comedy" | "minimal" | "slide" };
  share_link_created: { stats: number };
  share_link_deleted: Record<string, never>;
  replay_visit: { referred: boolean };
  replay_create_start: { via: "make_your_own" | "sample" };
}

export type EventName = keyof EventProps;

const ALLOWED: { [K in EventName]: Record<string, readonly (string | boolean)[] | "int"> } = {
  landing_cta: { position: ["hero", "footer"] },
  sample_selected: { sample: ["marathoner", "closer", "optimist"], from: ["landing", "make", "replay"] },
  import_completed: { source: ["paste", "file", "sample"], rows: ["1-7", "8-29", "30-74", "75-149", "150+"], columns_corrected: [true, false], warnings: "int" },
  import_failed: { source: ["paste", "file"], reason: ["empty", "no_company", "too_large", "parse_error"] },
  story_completed: { slides: "int", mode: ["own", "sample", "replay"] },
  export: { style: ["achievement", "comedy", "minimal", "slide"], size: ["story", "landscape"] },
  share_action: { method: ["web_share", "download", "copy_caption", "copy_link", "x_intent", "linkedin_intent"], style: ["achievement", "comedy", "minimal", "slide"] },
  share_link_created: { stats: "int" },
  share_link_deleted: {},
  replay_visit: { referred: [true, false] },
  replay_create_start: { via: ["make_your_own", "sample"] },
};

export interface TrackedEvent {
  name: EventName;
  props: Record<string, string | number | boolean>;
  /** share id this session arrived from, if any (a random id, never personal data) */
  ref?: string;
}

export interface Adapter {
  send(e: TrackedEvent): void;
}

export function rowsBucket(n: number): Bucket {
  return n < 8 ? "1-7" : n < 30 ? "8-29" : n < 75 ? "30-74" : n < 150 ? "75-149" : "150+";
}

/** Drop anything not in the schema. Exported for tests. */
export function sanitize<N extends EventName>(name: N, props: EventProps[N]): TrackedEvent["props"] {
  const schema = ALLOWED[name];
  const out: TrackedEvent["props"] = {};
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    const rule = schema[k];
    if (!rule) continue;
    if (rule === "int") {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, Math.min(999, Math.round(v)));
    } else if ((rule as readonly unknown[]).includes(v)) out[k] = v as string | boolean;
  }
  return out;
}

export const devBuffer: TrackedEvent[] = [];

const devAdapter: Adapter = {
  send(e) {
    devBuffer.push(e);
    if (devBuffer.length > 200) devBuffer.shift();
    if (typeof window !== "undefined") (window as unknown as { __cwEvents?: TrackedEvent[] }).__cwEvents = devBuffer;
    if (process.env.NODE_ENV !== "production") console.debug("[cw-event]", e.name, e.props, e.ref ?? "");
  },
};

/** Beacon adapter for a self-hosted collector (e.g. a Plausible/Umami proxy). Sends no URL, no referrer. */
function beaconAdapter(endpoint: string): Adapter {
  return {
    send(e) {
      try {
        const body = JSON.stringify(e);
        if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
        else void fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" }, referrerPolicy: "no-referrer" });
      } catch {
        /* analytics must never break the product */
      }
    },
  };
}

let adapter: Adapter | null = null;
function getAdapter(): Adapter {
  if (adapter) return adapter;
  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  adapter = endpoint && typeof window !== "undefined" ? beaconAdapter(endpoint) : devAdapter;
  return adapter;
}
export function setAdapter(a: Adapter | null) {
  adapter = a;
}

const REF_KEY = "cw_ref";
const REF_RE = /^[A-Za-z0-9_-]{6,16}$/;

/** Remember the share id a visitor arrived from (session only). */
export function rememberReferral(shareId: string) {
  if (!REF_RE.test(shareId)) return;
  try {
    sessionStorage.setItem(REF_KEY, shareId);
  } catch {}
}
export function getReferral(): string | undefined {
  try {
    const v = sessionStorage.getItem(REF_KEY);
    return v && REF_RE.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function track<N extends EventName>(name: N, props: EventProps[N]) {
  try {
    getAdapter().send({ name, props: sanitize(name, props), ref: typeof window !== "undefined" ? getReferral() : undefined });
  } catch {
    /* never throw from analytics */
  }
}
