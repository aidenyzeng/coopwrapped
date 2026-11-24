"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import type { PublicSummaryV1 } from "@/lib/share/payload";
import { planReplay } from "@/lib/story/plan";
import { cardFromSummary } from "@/lib/share/card-data";
import { rememberReferral, track } from "@/lib/events/track";
import { StoryPlayer } from "@/components/story/StoryPlayer";
import { CardCanvas } from "@/components/share/CardCanvas";

export function ReplayPlayer({ summary, shareId }: { summary: PublicSummaryV1; shareId: string }) {
  const plan = useMemo(() => planReplay(summary), [summary]);
  const card = useMemo(() => cardFromSummary(summary), [summary]);
  useEffect(() => {
    rememberReferral(shareId);
    track("replay_visit", { referred: document.referrer !== "" });
  }, [shareId]);

  return (
    <StoryPlayer
      plan={plan}
      mode="replay"
      dialogOpen={false}
      closeHref="/"
      renderEnd={(type) =>
        type === "summary" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <CardCanvas data={card} size="story" className="h-full max-h-full w-auto max-w-full rounded-[1.6cqw] border-[0.5cqw] border-ink" label={`${card.total} applications, ${card.personaName}. ${card.personaSentence}`} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-end gap-[3cqw] pb-[4cqw]" data-no-nav>
            <Link href="/make?via=replay" className="btn btn-primary !py-[3.4cqw] text-[4.6cqw]" data-testid="make-your-own">
              Make your own
            </Link>
            <Link
              href="/sample/marathoner?via=replay"
              className="btn btn-secondary !py-[3.4cqw] text-[4.2cqw]"
            >
              Try it with sample data
            </Link>
            <p className="text-center text-[3.2cqw] font-medium opacity-80">No account. Nothing uploaded.</p>
          </div>
        )
      }
    />
  );
}
