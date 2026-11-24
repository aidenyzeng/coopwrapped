import { describe, expect, it } from "vitest";
import { importText } from "@/lib/import/build";
import { REF, csv, fixture } from "./helpers";

describe("import pipeline", () => {
  it("skips title rows and maps messy headers", () => {
    const r = importText(fixture("01-messy-headers.tsv"), { referenceDate: REF });
    expect(r.hasHeader).toBe(true);
    expect(r.headers[0].trim()).toBe("Company Name");
    expect(r.mapping.byColumn).toContain("company");
    expect(r.applications).toHaveLength(45);
  });

  it("warns about exact duplicates instead of silently deleting, and lets users keep them", () => {
    const text = fixture("04-duplicates.csv");
    const r = importText(text, { referenceDate: REF });
    const dup = r.issues.find((i) => i.kind === "exact_duplicate");
    expect(dup?.rows).toHaveLength(3);
    expect(r.applications).toHaveLength(29);
    const kept = importText(text, { referenceDate: REF, keepExactDuplicates: true });
    expect(kept.applications).toHaveLength(32);
  });

  it("merges spelling variants but reports it", () => {
    const r = importText(fixture("04-duplicates.csv"), { referenceDate: REF });
    const merged = r.issues.find((i) => i.kind === "company_merged");
    expect(merged?.message).toMatch(/Shopwise/);
    const keys = new Set(r.applications.filter((a) => /shopwise/i.test(a.company.raw)).map((a) => a.companyKey));
    expect(keys.size).toBe(1);
    expect(new Set(r.applications.filter((a) => /^Meta/.test(a.company.raw)).map((a) => a.companyKey)).size).toBe(2);
  });

  it("records provenance for normalized values", () => {
    const r = importText(csv([["Company", "Status", "Date"], ["Acme  Robotics", "Rejected 😭", "Jan 5"], ["Acme Robotics", "Applied", "2026-01-07"]]), { referenceDate: REF });
    const a = r.applications[0];
    expect(a.status).toMatchObject({ value: "rejected", provenance: "normalized" });
    expect(a.appliedDate).toMatchObject({ value: "2026-01-05", provenance: "inferred" });
    expect(r.applications[1].status.provenance).toBe("direct");
  });

  it("lists unknown statuses with an override key, and overrides apply", () => {
    const text = csv([["Company", "Status"], ["A", "declined"], ["B", "declined"], ["C", "Applied"]]);
    const r = importText(text, { referenceDate: REF });
    const issue = r.issues.find((i) => i.kind === "unknown_status")!;
    expect(issue.rows).toEqual([0, 1]);
    const fixed = importText(text, { referenceDate: REF, statusOverrides: { [issue.statusKey!]: "rejected" } });
    expect(fixed.applications.filter((a) => a.status.value === "rejected")).toHaveLength(2);
  });

  it("respects user mapping corrections without restarting", () => {
    const text = csv([["Who", "Thing"], ["Acme", "Applied"], ["Beta", "Rejected"]]);
    const r = importText(text, { referenceDate: REF, hasHeader: true, mapping: { byColumn: ["company", "status"] } });
    expect(r.applications.map((a) => a.status.value)).toEqual(["applied", "rejected"]);
  });

  it("skips rows without a company and warns", () => {
    const r = importText(csv([["Company", "Status"], ["", "Applied"], ["Acme", "Applied"]]), { referenceDate: REF });
    expect(r.applications).toHaveLength(1);
    expect(r.issues.some((i) => i.kind === "missing_company")).toBe(true);
  });

  it("handles headerless day-first input", () => {
    const r = importText(fixture("09-no-header-dmy.tsv"), { referenceDate: REF });
    expect(r.hasHeader).toBe(false);
    expect(r.mapping.dateFormat).toBe("dmy");
    expect(r.applications.every((a) => a.appliedDate.value !== null)).toBe(true);
  });

  it("processes 300 rows quickly", () => {
    const t = performance.now();
    const r = importText(fixture("06-large-300.csv"), { referenceDate: REF });
    expect(r.rows).toHaveLength(300);
    expect(performance.now() - t).toBeLessThan(250);
  });
});
