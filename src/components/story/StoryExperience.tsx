"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Metrics } from "@/lib/analytics/metrics";
import type { PersonaResult } from "@/lib/persona/personas";
import { planStory } from "@/lib/story/plan";
import { availableStats, defaultStatSelection } from "@/lib/share/stats";
import { cardFromSummary } from "@/lib/share/card-data";
import { StoryPlayer } from "./StoryPlayer";
import { ShareSheet, buildSummary, type ShareState } from "../share/ShareSheet";
import { CardCanvas } from "../share/CardCanvas";

export interface StoryExperienceProps {
  metrics: Metrics;
  persona: PersonaResult;
  seed: number;
  topCompany?: { name: string; count: number };
  mode: "own" | "sample";
  onClose?: () => void;
  closeHref?: string;
}

/** The user's own (or a sample's) story: player + summary card + share sheet. */
export function StoryExperience({ metrics, persona, seed, topCompany, mode, onClose, closeHref }: StoryExperienceProps) {
  const [share, setShare] = useState<ShareState>(() => ({
    style: "achievement",
    selected: defaultStatSelection(availableStats(metrics)),
    showCompany: false,
  }));
  const [sheet, setSheet] = useState<null | "card" | "why">(null);
  const [run, setRun] = useState(0);

  const plan = useMemo(
    () => planStory({ metrics, persona, seed, topCompany: topCompany?.name, showCompanyNames: share.showCompany }),
    [metrics, persona, seed, topCompany, share.showCompany],
  );
  const summary = useMemo(() => buildSummary(metrics, persona, seed, share), [metrics, persona, seed, share]);
  const companyLine = share.showCompany && topCompany ? `Most applied: ${topCompany.name} ×${topCompany.count}` : undefined;
  const card = useMemo(() => cardFromSummary(summary, { companyLine }), [summary, companyLine]);

  return (
    <>
      <StoryPlayer
        key={run}
        plan={plan}
        mode={mode}
        dialogOpen={sheet !== null}
        onClose={onClose}
        closeHref={closeHref}
        renderEnd={() => (
          <div className="flex min-h-0 flex-1 flex-col gap-[3cqw]">
            <button
              type="button"
              onClick={() => setSheet("card")}
              className="press flex min-h-0 flex-1 items-center justify-center"
              aria-label="Open share options for your card"
            >
              <CardCanvas
                data={card}
                size="story"
                className="h-full max-h-full w-auto max-w-full rounded-[1.6cqw] border-[0.5cqw] border-ink shadow-[1cqw_1cqw_0_var(--ink)]"
                label={`Your card: ${card.total} applications, ${card.personaName}. ${card.personaSentence}`}
              />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-[2cqw]" data-no-nav>
              <button type="button" className="btn btn-primary !px-[5cqw] !py-[2.4cqw] text-[3.8cqw]" onClick={() => setSheet("card")} data-testid="open-share">
                Share card
              </button>
              <button type="button" className="btn btn-secondary !px-[4cqw] !py-[2.4cqw] text-[3.4cqw]" onClick={() => setSheet("why")}>
                Why this persona?
              </button>
              <button type="button" className="text-[3.4cqw] font-bold underline underline-offset-4" onClick={() => setRun((r) => r + 1)}>
                Replay
              </button>
              {mode === "sample" ? (
                <Link href="/make" className="text-[3.4cqw] font-bold underline underline-offset-4">
                  Make your own
                </Link>
              ) : null}
            </div>
          </div>
        )}
      />
      <ShareSheet
        open={sheet !== null}
        initialTab={sheet ?? "card"}
        onClose={() => setSheet(null)}
        metrics={metrics}
        persona={persona}
        seed={seed}
        topCompany={topCompany}
        state={share}
        setState={setShare}
      />
    </>
  );
}
