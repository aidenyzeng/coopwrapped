import fs from "node:fs";
import { renderCardPng } from "../src/lib/server/canvas";
import { cardFromSummary } from "../src/lib/share/card-data";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
for (const style of ["achievement", "comedy", "minimal"] as const) {
  const d = cardFromSummary({ v: 1, persona: "marathoner", personaParam: 142, total: 142, seed: 12345, style,
    stats: [{ key: "companies", value: 118 }, { key: "interviews", value: 9, of: 142 }, { key: "busiest_week", value: 31 }] });
  for (const size of ["story", "landscape"] as const) fs.writeFileSync(`${out}/${style}-${size}.png`, renderCardPng(d, size));
}
