import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SAMPLE_IDS, SAMPLES, type SampleId } from "@/lib/samples/data";
import { SampleStory } from "./SampleStory";

export function generateStaticParams() {
  return SAMPLE_IDS.map((id) => ({ id }));
}
export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/sample/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = SAMPLES[id as SampleId];
  return { title: s ? `Sample: ${s.label} — Co-op Wrapped` : "Co-op Wrapped" };
}

export default async function Page(props: PageProps<"/sample/[id]">) {
  const { id } = await props.params;
  if (!(SAMPLE_IDS as string[]).includes(id)) notFound();
  return (
    <main>
      <h1 className="sr-only">Sample recap: {SAMPLES[id as SampleId].label}</h1>
      <SampleStory id={id as SampleId} />
    </main>
  );
}
