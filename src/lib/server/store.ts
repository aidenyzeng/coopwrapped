import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { validateSummary, type PublicSummaryV1 } from "../share/payload";

/**
 * Share-link storage. Stores ONLY the validated public summary, a creation
 * timestamp and a hash of the deletion token.
 *
 * Backends:
 *  - Upstash Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN): production.
 *  - Local JSON files under .data/shares: development / self-hosting on a writable disk.
 */

export interface StoredShare {
  summary: PublicSummaryV1;
  createdAt: string;
  tokenHash: string;
}

const ID_RE = /^[A-Za-z0-9]{10}$/;
export const isShareId = (id: string) => ID_RE.test(id);
const TTL_SECONDS = 60 * 60 * 24 * 365; // links expire after a year

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function randomId(len: number) {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

interface Backend {
  get(id: string): Promise<StoredShare | null>;
  put(id: string, v: StoredShare): Promise<void>;
  del(id: string): Promise<void>;
  incr(key: string, windowSec: number): Promise<number>;
}

function upstash(url: string, token: string): Backend {
  const call = async (cmd: (string | number)[]) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`store error ${res.status}`);
    return (await res.json()).result;
  };
  return {
    async get(id) {
      const raw = await call(["GET", `share:${id}`]);
      return raw ? (JSON.parse(raw) as StoredShare) : null;
    },
    async put(id, v) {
      await call(["SET", `share:${id}`, JSON.stringify(v), "EX", TTL_SECONDS, "NX"]);
    },
    async del(id) {
      await call(["DEL", `share:${id}`]);
    },
    async incr(key, windowSec) {
      const n = await call(["INCR", `rl:${key}`]);
      if (n === 1) await call(["EXPIRE", `rl:${key}`, windowSec]);
      return n as number;
    },
  };
}

function fileStore(dir: string): Backend {
  const counters = new Map<string, { n: number; until: number }>();
  const file = (id: string) => path.join(dir, `${id}.json`);
  return {
    async get(id) {
      try {
        return JSON.parse(await fs.readFile(file(id), "utf8")) as StoredShare;
      } catch {
        return null;
      }
    },
    async put(id, v) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(id), JSON.stringify(v), { flag: "wx" });
    },
    async del(id) {
      await fs.rm(file(id), { force: true });
    },
    async incr(key, windowSec) {
      const now = Date.now();
      const c = counters.get(key);
      if (!c || c.until < now) {
        counters.set(key, { n: 1, until: now + windowSec * 1000 });
        return 1;
      }
      c.n++;
      return c.n;
    },
  };
}

let backend: Backend | null = null;
function store(): Backend {
  if (backend) return backend;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  backend = url && token ? upstash(url, token) : fileStore(path.join(process.cwd(), ".data", "shares"));
  return backend;
}

export const RATE_LIMIT = { max: 10, windowSec: 3600 };

/** Fixed-window rate limit keyed by a hash of the client IP (the IP itself is never stored). */
export async function rateLimited(ip: string): Promise<boolean> {
  const n = await store().incr(`create:${hash(ip).slice(0, 16)}`, RATE_LIMIT.windowSec);
  return n > RATE_LIMIT.max;
}

export async function createShare(summary: PublicSummaryV1): Promise<{ id: string; deleteToken: string }> {
  const check = validateSummary(summary);
  if (!check.ok) throw new Error(check.error);
  const id = randomId(10);
  const deleteToken = randomId(24);
  await store().put(id, { summary: check.value, createdAt: new Date().toISOString(), tokenHash: hash(deleteToken) });
  return { id, deleteToken };
}

export async function getShare(id: string): Promise<PublicSummaryV1 | null> {
  if (!isShareId(id)) return null;
  const s = await store().get(id);
  if (!s) return null;
  // re-validate on read: storage is treated as untrusted too
  const v = validateSummary(s.summary);
  return v.ok ? v.value : null;
}

export async function deleteShare(id: string, token: string): Promise<boolean> {
  if (!isShareId(id) || typeof token !== "string" || token.length > 64) return false;
  const s = await store().get(id);
  if (!s) return false;
  const a = Buffer.from(s.tokenHash);
  const b = Buffer.from(hash(token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  await store().del(id);
  return true;
}
