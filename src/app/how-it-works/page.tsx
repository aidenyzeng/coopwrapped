import { SiteHeader } from "@/components/SiteHeader";
import type { Metadata } from "next";
import { PERSONAS } from "@/lib/persona/personas";

export const metadata: Metadata = {
  title: "How it works | co-wrapped",
  description: "How Co-wrapped reads your spreadsheet, calculates each number, picks your persona, and what (if anything) leaves your browser.",
};

function H2({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="mt-14 text-3xl font-extrabold tracking-[-0.02em]">
      {children}
    </h2>
  );
}

export default function Page() {
  return (
    <div className="min-h-dvh bg-[#fbfbfa]">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">

      <main>
        <h1 className="font-pixel mt-10 text-[clamp(2.6rem,8vw,4.4rem)] leading-[1]">
          How it works
        </h1>
        <p className="mt-5 text-lg leading-relaxed">
          Co-wrapped turns an application tracker into a short story. Here’s exactly what it does with your data and how every number is calculated.
        </p>

        <H2 id="privacy">Privacy</H2>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed">
          <li>Your pasted text or CSV is parsed and analyzed <strong>in your browser</strong>. Large files are processed in a Web Worker, still on your device.</li>
          <li>Rows, company names, roles, dates and files are never uploaded and never sent to analytics. Nothing is saved after you close the tab.</li>
          <li>Analytics events record only coarse actions (for example, “a card was exported in the Minimal style”) with allowlisted values. Exporting or tapping share does not mean anything was posted. We can’t see that, and don’t try.</li>
          <li>A <strong>share link</strong> is only created when you press “Create share link” and confirm. It stores your persona, your total, up to three numbers you picked, the card style and a visual seed. You can delete it from the same browser; links expire after a year.</li>
        </ul>

        <H2 id="numbers">How the numbers work</H2>
        <dl className="mt-4 space-y-5 leading-relaxed">
          <div>
            <dt className="font-extrabold">Applications</dt>
            <dd>Rows with a company name. Exact duplicate rows (same company, role, date and status) are counted once by default. You’ll see a warning and can choose to count them. Similar rows with different details are kept, since re-applying is common.</dd>
          </div>
          <div>
            <dt className="font-extrabold">Companies</dt>
            <dd>Names are grouped only when they differ by case, spacing, punctuation or a legal suffix (“Shopwise Inc.” = “shopwise”). Similar-looking names are never merged.</dd>
          </div>
          <div>
            <dt className="font-extrabold">Statuses are current, not history</dt>
            <dd>A status column tells us where each application is now. It doesn’t tell us what happened before: a rejected application may have included an interview. Outcome slides are labeled as current status, with the denominator shown.</dd>
          </div>
          <div>
            <dt className="font-extrabold">Interviews</dt>
            <dd>We only talk about applications that “reached an interview” when your sheet records it: an interview date or yes/no column, a status like “Interviewing”, or wording like “rejected after interview”. An accepted offer is not assumed to have a recorded interview.</dd>
          </div>
          <div>
            <dt className="font-extrabold">No recorded response</dt>
            <dd>Applications still marked applied, pending or similar are “no recorded response”. We never call them ghosted. When dates exist, we separately count ones with no response after 30+ days.</dd>
          </div>
          <div>
            <dt className="font-extrabold">Offers</dt>
            <dd>Counted from offer, accepted or offer-declined statuses, or an offer/accepted column. Celebration slides only appear when an offer is actually recorded.</dd>
          </div>
          <div>
            <dt className="font-extrabold">Dates</dt>
            <dd>The rhythm slide needs at least 5 readable dates covering half your rows. Ambiguous formats like 03/04 are flagged so you can pick month- or day-first. Missing or unreadable dates are left out and the slide says how many were used.</dd>
          </div>
          <div>
            <dt className="font-extrabold">No benchmarks</dt>
            <dd>We don’t compare you to other students or invent industry categories. Every number comes from your sheet.</dd>
          </div>
        </dl>

        <H2 id="personas">Personas</H2>
        <p className="mt-4 leading-relaxed">Rules are checked in this order; the first one that matches is yours, so the same data always gets the same persona.</p>
        <ol className="mt-4 space-y-3">
          {PERSONAS.map((p, i) => (
            <li key={p.id} className="rounded-2xl border border-black/10 bg-white p-4">
              <span className="mr-2 font-mono text-sm text-ink/60">{String(i + 1).padStart(2, "0")}</span>
              <strong className="text-lg">{p.name}</strong>
              <p className="mt-1 text-[15px]">{p.rule}</p>
            </li>
          ))}
        </ol>
      </main>
      </div>
    </div>
  );
}
