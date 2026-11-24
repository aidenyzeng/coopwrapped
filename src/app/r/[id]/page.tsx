import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getShare, isShareId } from "@/lib/server/store";
import { PERSONA_BY_ID } from "@/lib/persona/personas";
import { ReplayPlayer } from "./ReplayPlayer";

async function load(id: string) {
  if (!isShareId(id)) return null;
  return getShare(id).catch(() => null);
}

export async function generateMetadata(props: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = await load(id);
  if (!s) return { title: "Co-wrapped", robots: { index: false } };
  const persona = PERSONA_BY_ID[s.persona].name;
  const title = `${s.total} applications · ${persona} — Co-wrapped`;
  const description = "A co-op search, wrapped. See the recap, then make your own — your spreadsheet never leaves your browser.";
  const image = { url: `/api/og/${id}`, width: 1200, height: 630, alt: `${s.total} applications. Search persona: ${persona}.` };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page(props: PageProps<"/r/[id]">) {
  const { id } = await props.params;
  const s = await load(id);
  if (!s) notFound();
  return (
    <main>
      <h1 className="sr-only">A shared Co-wrapped recap</h1>
      <ReplayPlayer summary={s} shareId={id} />
    </main>
  );
}
