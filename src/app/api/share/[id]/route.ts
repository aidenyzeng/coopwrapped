import { NextResponse } from "next/server";
import { deleteShare } from "@/lib/server/store";

export async function DELETE(req: Request, ctx: RouteContext<"/api/share/[id]">) {
  const { id } = await ctx.params;
  const token = req.headers.get("x-delete-token") ?? "";
  const ok = await deleteShare(id, token).catch(() => false);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
