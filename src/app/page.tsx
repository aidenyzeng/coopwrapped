import { preload } from "react-dom";
import Link from "next/link";
import { CardRing, type RingItem } from "@/components/landing/CardRing";
import { Wordmark } from "@/components/landing/Wordmark";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { SAMPLES, SAMPLE_IDS } from "@/lib/samples/data";
import { sampleSummary } from "@/lib/samples/summary";
import { CARD_STYLES } from "@/lib/share/payload";
import { PERSONA_BY_ID } from "@/lib/persona/personas";
import type { ThemeId } from "@/lib/design/tokens";

const STYLE_LABEL = { achievement: "Achievement", comedy: "Comedy", minimal: "Minimal" } as const;

// Interleave samples so neighbouring panels differ: marathoner/achievement, closer/comedy, optimist/minimal, …
// Wordmark tints per persona colour, deepened so they stay legible (≥3:1) on the near-white page.
const DEEP: Record<ThemeId, string> = {
  ultra: "#3240f0", sun: "#a86b00", lime: "#4f6b00", tomato: "#d8401c", pink: "#c03b7c", mint: "#167a5a", ink: "#111111", paper: "#5f5a55",
};

const ITEMS: RingItem[] = CARD_STYLES.flatMap((_, si) =>
  SAMPLE_IDS.map((id, k) => {
    const style = CARD_STYLES[(si + k) % CARD_STYLES.length];
    const summary = sampleSummary(id);
    const total = summary.total;
    const deep = DEEP[PERSONA_BY_ID[summary.persona].tone];
    return {
      src: `/samples/${id}-${style}.webp`,
      href: `/sample/${id}`,
      title: SAMPLES[id].label,
      subtitle: `Sample · ${STYLE_LABEL[style]} style`,
      alt: `${SAMPLES[id].label} sample card, ${style} style: ${total} applications.`,
      sample: id,
      pick: [style === "minimal" ? "#111111" : deep, "#111111", deep] as [string, string, string],
    };
  }),
);

export default function Home() {
  // The front ring card is the LCP element: fetch it with the HTML, at high priority.
  // (Inlining it as a data URI was measured and was slower: Next embeds it twice.)
  const lcp = ITEMS[0].src;
  preload(lcp, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: `${lcp.replace(".webp", "-720.webp")} 720w, ${lcp} 1080w`,
    imageSizes: "(max-width: 639px) 80vw, (max-width: 1023px) 56vw, min(38vw, 620px)",
  });

  // Single screen, no scroll: nav, wordmark, ring (flexes), caption + CTA.
  return (
    <div className="font-allo flex h-dvh flex-col overflow-hidden bg-[#fbfbfa] text-ink">


      <header className="flex shrink-0 items-center justify-end gap-6 px-5 pt-5 text-[16px] text-ink/60 sm:px-8 sm:pt-7 sm:text-[17px]">
        <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
        <TrackedLink href="/make" event="landing_cta" className="hover:text-ink">
          Make yours
        </TrackedLink>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-[clamp(0.5rem,6dvh,5rem)] text-center">
          <Wordmark className="mx-auto w-fit text-[clamp(3.4rem,min(14vw,14dvh),9rem)] leading-[0.9]" />
          <p className="mx-auto mt-[clamp(0.5rem,2dvh,1.25rem)] max-w-xl text-[clamp(0.95rem,2dvh,1.125rem)] leading-snug text-ink/60">
            Your co-op search, as a story.
          </p>
        </div>

        <CardRing items={ITEMS} />

        <div className="flex shrink-0 flex-col items-center gap-2 px-5 pb-[clamp(1rem,4dvh,2.5rem)] pt-[clamp(0.75rem,2.4dvh,1.5rem)]">
          <TrackedLink href="/make" event="landing_cta" className="press rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-black">
            Make your co-wrapped
          </TrackedLink>
          <p className="text-[13px] text-ink/60">Runs in your browser. Your spreadsheet is never uploaded.</p>
        </div>
      </main>
    </div>
  );
}
