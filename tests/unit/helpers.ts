import fs from "node:fs";
import path from "node:path";
import { importText } from "@/lib/import/build";
import { analyze } from "@/lib/analytics/metrics";
import { selectPersona } from "@/lib/persona/personas";

export const REF = "2026-11-24";
export const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../../fixtures", name), "utf8");
export function run(text: string, ref = REF) {
  const result = importText(text, { referenceDate: ref });
  const metrics = analyze(result, ref);
  return { result, metrics, persona: selectPersona(metrics) };
}
export const csv = (rows: string[][]) => rows.map((r) => r.join(",")).join("\n");
