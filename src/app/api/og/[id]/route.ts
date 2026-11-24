import { getShare } from "@/lib/server/store";
import { renderCardPng } from "@/lib/server/canvas";
import { cardFromSummary } from "@/lib/share/card-data";
import { SAMPLE_SUMMARY } from "@/lib/samples/summary";
import type { CardSize } from "@/lib/card/render";

export const runtime = "nodejs";

/** Open Graph image rendered from the sanitized summary with the same renderer as exports. */
export async function GET(req: Request, ctx: RouteContext<"/api/og/[id]">) {
  const { id } = await ctx.params;
  const size: CardSize = new URL(req.url).searchParams.get("size") === "story" ? "story" : "landscape";
  const summary = id === "sample" ? SAMPLE_SUMMARY : await getShare(id).catch(() => null);
  if (!summary) return new Response("Not found", { status: 404 });
  const png = renderCardPng(cardFromSummary(summary), size);
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": id === "sample" ? "public, max-age=86400" : "public, max-age=300, s-maxage=3600",
    },
  });
}
