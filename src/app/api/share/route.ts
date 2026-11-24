import { NextResponse } from "next/server";
import { MAX_PAYLOAD_BYTES, parseSummaryBody } from "@/lib/share/payload";
import { createShare, rateLimited } from "@/lib/server/store";

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_PAYLOAD_BYTES * 2) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!(req.headers.get("content-type") ?? "").includes("application/json"))
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  try {
    if (await rateLimited(ip)) return NextResponse.json({ error: "Too many share links — try again later." }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "Share links are unavailable right now." }, { status: 503 });
  }

  const body = await req.text();
  const parsed = parseSummaryBody(body);
  if (!parsed.ok) return NextResponse.json({ error: `Invalid summary: ${parsed.error}` }, { status: 400 });

  try {
    const { id, deleteToken } = await createShare(parsed.value);
    return NextResponse.json({ id, deleteToken }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Share links are unavailable right now." }, { status: 503 });
  }
}
