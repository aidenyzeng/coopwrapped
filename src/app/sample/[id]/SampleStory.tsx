"use client";

import { useEffect, useMemo } from "react";
import { SAMPLES, type SampleId } from "@/lib/samples/data";
import { runPipeline } from "@/lib/pipeline";
import { track } from "@/lib/events/track";
import { StoryExperience } from "@/components/story/StoryExperience";

// Fixed reference date so sample stories are identical for everyone, every day.
const SAMPLE_REF = "2026-11-24";

export function SampleStory({ id }: { id: SampleId }) {
  const a = useMemo(() => runPipeline(SAMPLES[id].text, { referenceDate: SAMPLE_REF }), [id]);
  useEffect(() => {
    const via = new URLSearchParams(window.location.search).get("via");
    track("sample_selected", { sample: id, from: via === "replay" ? "replay" : via === "make" ? "make" : "landing" });
    if (via === "replay") track("replay_create_start", { via: "sample" });
  }, [id]);
  return <StoryExperience metrics={a.metrics} persona={a.persona} seed={a.seed} topCompany={a.topCompany} mode="sample" closeHref="/" />;
}
