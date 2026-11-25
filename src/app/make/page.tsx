import type { Metadata } from "next";
import { MakeFlow } from "@/components/make/MakeFlow";

export const metadata: Metadata = {
  title: "Make yours | co-wrapped",
  description: "Paste your application tracker or upload a CSV. Everything is processed in your browser.",
};

export default function Page() {
  return <MakeFlow />;
}
