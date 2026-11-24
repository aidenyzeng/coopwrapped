import Link from "next/link";
import { CardRing, type RingItem } from "@/components/landing/CardRing";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { SAMPLES, SAMPLE_IDS } from "@/lib/samples/data";
import { sampleSummary } from "@/lib/samples/summary";
import { CARD_STYLES } from "@/lib/share/payload";

const STYLE_LABEL = { achievement: "Achievement", comedy: "Comedy", minimal: "Minimal" } as const;

// Interleave samples so neighbouring panels differ: marathoner/achievement, closer/comedy, optimist/minimal, …
const ITEMS: RingItem[] = CARD_STYLES.flatMap((_, si) =>
  SAMPLE_IDS.map((id, k) => {
    const style = CARD_STYLES[(si + k) % CARD_STYLES.length];
    const total = sampleSummary(id).total;
    return {
      src: `/samples/${id}-${style}.webp`,
      href: `/sample/${id}`,
      title: SAMPLES[id].label,
      subtitle: `Sample · ${STYLE_LABEL[style]} style`,
      alt: `${SAMPLES[id].label} sample card, ${style} style: ${total} applications.`,
      sample: id,
    };
  }),
);

export default function Home() {
  // Single screen, no scroll: nav, wordmark, ring (flexes), caption + CTA.
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#fbfbfa] text-ink">


      <header className="flex shrink-0 items-center justify-end gap-6 px-5 pt-5 text-[16px] text-ink/60 sm:px-8 sm:pt-7 sm:text-[17px]">
        <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
        <TrackedLink href="/make" event="landing_cta" className="hover:text-ink">
          Make yours
        </TrackedLink>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-[clamp(0.5rem,6dvh,5rem)] text-center">
          <h1 className="wordmark mx-auto text-[clamp(3.2rem,min(12vw,13dvh),8.5rem)] font-semibold leading-[0.9] tracking-[-0.055em]">
            co-op wrapped
          </h1>
          <p className="mx-auto mt-[clamp(0.5rem,2dvh,1.25rem)] max-w-xl text-[clamp(0.95rem,2dvh,1.125rem)] leading-snug text-ink/60">
            Your job-application spreadsheet, turned into a story worth sharing.
          </p>
        </div>

        <CardRing items={ITEMS} />

        <div className="flex shrink-0 flex-col items-center gap-2 px-5 pb-[clamp(1rem,4dvh,2.5rem)] pt-[clamp(0.75rem,2.4dvh,1.5rem)]">
          <TrackedLink href="/make" event="landing_cta" className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-black">
            Make your Wrapped
          </TrackedLink>
          <p className="text-[13px] text-ink/60">Runs in your browser. Your spreadsheet is never uploaded.</p>
        </div>
      </main>
    </div>
  );
}
