import Link from "next/link";
import { Stamp } from "@/components/Stamp";
import { COLORS } from "@/lib/design/tokens";
import { SAMPLES, SAMPLE_IDS } from "@/lib/samples/data";
import { sampleSummary } from "@/lib/samples/summary";
import { PERSONA_BY_ID } from "@/lib/persona/personas";
import { statDisplay } from "@/lib/share/stats";
import { TrackedLink } from "@/components/landing/TrackedLink";

const reel = sampleSummary("marathoner");
const reelPersona = PERSONA_BY_ID[reel.persona];

function Reel() {
  const slides = [
    { bg: COLORS.ink, fg: COLORS.paper, body: (
      <div className="flex h-full flex-col justify-center">
        <p className="text-[11cqw] font-extrabold leading-[0.95] tracking-[-0.04em]">Your co-op search,</p>
        <p className="font-serif-i text-[17cqw] leading-none" style={{ color: COLORS.lime }}>wrapped.</p>
      </div>
    ) },
    { bg: COLORS.tomato, fg: COLORS.ink, body: (
      <div className="flex h-full flex-col justify-center">
        <p className="text-[3.6cqw] font-semibold uppercase tracking-[0.14em]">The volume</p>
        <p className="tabular text-[34cqw] font-extrabold leading-[0.85] tracking-[-0.05em]">{reel.total}</p>
        <p className="font-serif-i text-[9cqw] leading-none">applications</p>
        <p className="mt-[5cqw] text-[6.4cqw] font-extrabold leading-tight">That’s a lot of “I’m excited to apply.”</p>
      </div>
    ) },
    { bg: COLORS.ultra, fg: COLORS.paper, body: (
      <div className="flex h-full flex-col justify-center">
        <p className="text-[3.6cqw] font-semibold uppercase tracking-[0.14em]">Your search persona</p>
        <Stamp persona={reel.persona} seed={reel.seed} tone="ultra" hole={COLORS.ultra} className="mx-auto my-[5cqw] w-[52cqw]" />
        <p className="text-[11cqw] font-extrabold leading-[0.95] tracking-[-0.03em]">{reelPersona.name}</p>
        <p className="mt-[3cqw] text-[4.6cqw] font-medium leading-snug">{reelPersona.sentence(reel.personaParam, reel.total)}</p>
      </div>
    ) },
    { bg: COLORS.paper, fg: COLORS.ink, body: (
      <div className="flex h-full flex-col justify-center">
        <p className="text-[3.6cqw] font-semibold uppercase tracking-[0.14em]">Share your season</p>
        <ul className="mt-[4cqw] divide-y-2 divide-ink/15">
          {reel.stats.map((s) => {
            const d = statDisplay(s);
            return (
              <li key={s.key} className="flex items-baseline gap-[4cqw] py-[3cqw]">
                <span className="tabular min-w-[28cqw] text-[12cqw] font-extrabold leading-none">{d.value}</span>
                <span className="text-[4.4cqw] font-semibold">{d.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    ) },
  ];
  return (
    <div
      className="relative mx-auto aspect-[9/16] w-[min(78vw,330px)] overflow-hidden rounded-[28px] border-[3px] border-ink shadow-[8px_8px_0_var(--ink)]"
      style={{ containerType: "inline-size" }}
      role="img"
      aria-label={`Animated sample recap: ${reel.total} applications, persona ${reelPersona.name}.`}
    >
      <div className="reel-track h-[400%]">
        {slides.map((s, i) => (
          <div key={i} className="h-1/4 px-[7cqw] pb-[8cqw] pt-[12cqw]" style={{ background: s.bg, color: s.fg }}>
            {s.body}
          </div>
        ))}
      </div>
      <div className="reel-progress absolute inset-x-0 top-0 flex gap-1 p-2.5" aria-hidden>
        {slides.map((_, i) => (
          <span key={i} className="block h-[3px] flex-1 rounded-full mix-blend-difference">
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="text-lg font-extrabold tracking-tight">Co-op Wrapped</span>
        <nav aria-label="Main">
          <Link href="/how-it-works" className="rounded-full px-3 py-2 text-sm font-bold underline-offset-4 hover:underline">
            How it works
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-12">
          <div>
            <p className="inline-block -rotate-2 rounded-md bg-ink px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-paper">
              For co-op & internship hunters
            </p>
            <h1 className="mt-5 text-[clamp(3.1rem,11vw,7.2rem)] font-extrabold leading-[0.88] tracking-[-0.05em]">
              Your job search, <span className="font-serif-i font-normal tracking-[-0.02em] text-tomato [text-shadow:2px_2px_0_var(--ink)]">wrapped.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[clamp(1.1rem,2.4vw,1.35rem)] leading-snug">
              Paste your application tracker. Get a personal story of your season — and a card you’ll actually want to post.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedLink href="/make" event="landing_cta" className="btn btn-accent text-lg">
                Make yours — it’s free
              </TrackedLink>
              <TrackedLink href="/sample/marathoner" event="sample" sample="marathoner" className="btn btn-secondary text-lg">
                Try sample data
              </TrackedLink>
            </div>
            <p className="mt-6 flex max-w-md items-start gap-2 text-sm text-muted">
              <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Your spreadsheet is processed in your browser. No account, nothing uploaded.
            </p>
          </div>
          <Reel />
        </section>

        <section aria-labelledby="how" className="border-y-[3px] border-ink bg-ink py-16 text-paper">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="how" className="text-[clamp(2rem,5vw,3.2rem)] font-extrabold tracking-[-0.03em]">
              Paste. Watch. <span className="font-serif-i font-normal text-lime">Post.</span>
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                ["Paste your tracker", "Copy the cells from Sheets, Excel or Numbers — or upload a CSV. Messy headers and “rejected 😭” statuses are fine."],
                ["Check, then watch", "We show what we detected so you can fix anything in seconds. Then your story plays: volume, rhythm, outcomes, persona."],
                ["Share the card", "Pick a style, choose which stats to show, and export a story or post-sized image. Company names stay hidden by default."],
              ].map(([t, d], i) => (
                <li key={t}>
                  <span className="font-serif-i text-5xl text-lime">0{i + 1}</span>
                  <h3 className="mt-2 text-xl font-extrabold">{t}</h3>
                  <p className="mt-2 leading-relaxed text-paper/80">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="samples" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="samples" className="text-[clamp(2rem,5vw,3.2rem)] font-extrabold tracking-[-0.03em]">Three seasons, three stories</h2>
          <p className="mt-2 max-w-xl text-lg">Sample trackers with fictional companies. Tap one to play the full story.</p>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {SAMPLE_IDS.map((id) => (
              <li key={id}>
                <TrackedLink href={`/sample/${id}`} event="sample" sample={id} className="group block rounded-2xl border-[3px] border-ink bg-white/40 p-2 shadow-[5px_5px_0_var(--ink)] transition-transform hover:-translate-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/samples/${id}.webp`} width={800} height={420} alt={`${SAMPLES[id].label} sample card`} loading="lazy" decoding="async" className="h-auto w-full rounded-xl" />
                  <span className="mt-3 block px-1 text-lg font-extrabold">{SAMPLES[id].label}</span>
                  <span className="block px-1 pb-1 text-sm text-muted">{SAMPLES[id].blurb}</span>
                </TrackedLink>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-6 rounded-3xl border-[3px] border-ink bg-mint p-6 md:grid-cols-2 md:p-10">
            <div>
              <h2 id="privacy" className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold leading-tight tracking-[-0.03em]">
                Your spreadsheet stays on your device.
              </h2>
            </div>
            <ul className="space-y-3 text-[17px] leading-snug">
              <li><strong>Parsed in your browser.</strong> Rows, company names and files are never uploaded or sent to analytics.</li>
              <li><strong>You choose what’s shared.</strong> Cards hide company names by default, and you pick every stat.</li>
              <li><strong>Share links are optional.</strong> They store only a persona, your total and up to three numbers — and you can delete them.</li>
              <li><Link href="/how-it-works" className="font-bold underline underline-offset-4">How the numbers are calculated →</Link></li>
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 text-center sm:px-6">
          <h2 className="text-[clamp(2.2rem,7vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">
            Every application <span className="font-serif-i font-normal">counts.</span>
          </h2>
          <TrackedLink href="/make" event="landing_cta" position="footer" className="btn btn-primary mt-8 text-lg">
            Make your Co-op Wrapped
          </TrackedLink>
        </section>
      </main>

      <footer className="border-t-2 border-ink/15 px-4 py-6 text-center text-sm text-muted">
        Co-op Wrapped is an independent project, not affiliated with any school, job board or employer.
      </footer>
    </div>
  );
}
