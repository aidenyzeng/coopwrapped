import type { Application } from "../model/types";

/** Local-only: most-applied company (≥2 applications). Never part of a public summary. */
export function topCompany(apps: Application[]): { name: string; count: number } | undefined {
  const counts = new Map<string, { name: string; count: number }>();
  for (const a of apps) {
    const c = counts.get(a.companyKey) ?? { name: a.company.value, count: 0 };
    c.count++;
    counts.set(a.companyKey, c);
  }
  const best = [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name))[0];
  return best && best.count >= 2 ? best : undefined;
}
