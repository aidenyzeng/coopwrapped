import { describe, expect, it } from "vitest";
import { companyKey, inferDateFormat, normalizeFlag, normalizeStatus, parseDate } from "@/lib/import/normalize";

describe("status normalization", () => {
  const cases: [string, string][] = [
    ["Applied", "applied"], ["submitted ✅", "applied"], ["In Review", "applied"], ["Rejected 😭", "rejected"],
    ["not selected", "rejected"], ["they said no", "rejected"], ["Position filled", "rejected"], ["Interviewing", "interviewing"],
    ["phone screen done", "interviewing"], ["OA", "screening"], ["Online assessment", "screening"], ["Offer!!", "offer"],
    ["Accepted offer", "accepted"], ["Offer declined", "declined"], ["Withdrew", "withdrawn"], ["ghosted lol", "no_response"],
    ["No response", "no_response"], ["maybe", "unknown"],
  ];
  it.each(cases)("%s → %s", (raw, want) => expect(normalizeStatus(raw)?.status).toBe(want));

  it("treats bare 'declined' as ambiguous instead of guessing who declined", () => {
    expect(normalizeStatus("declined")?.status).toBe("unknown");
  });
  it("detects interview history inside rejection wording", () => {
    expect(normalizeStatus("Rejected after final round interview")).toMatchObject({ status: "rejected", impliesInterview: true });
    expect(normalizeStatus("Rejected")).toMatchObject({ status: "rejected", impliesInterview: false });
  });
  it("returns null for blank", () => expect(normalizeStatus("   ")).toBeNull());
});

describe("company normalization is conservative", () => {
  it("groups case/spacing/punctuation/suffix variants", () => {
    expect(companyKey("Shopwise")).toBe(companyKey("shopwise inc."));
    expect(companyKey("SHOPWISE ")).toBe(companyKey("Shopwise, Inc"));
    expect(companyKey("Cedar & Pine Studio")).toBe(companyKey("Cedar and Pine Studio"));
  });
  it("keeps similar but distinct companies apart", () => {
    expect(companyKey("Meta Materials")).not.toBe(companyKey("Metal Works Inc"));
    expect(companyKey("Meta")).not.toBe(companyKey("Metal"));
    expect(companyKey("RBC")).not.toBe(companyKey("Royal Bank of Canada"));
    expect(companyKey("Google")).not.toBe(companyKey("Google Cloud"));
  });
});

describe("dates", () => {
  it("infers day-first when a day > 12 appears", () => expect(inferDateFormat(["03/02/2026", "13/02/2026"])).toEqual({ format: "dmy", ambiguous: false }));
  it("infers month-first when a day > 12 appears second", () => expect(inferDateFormat(["1/15/2026", "2/3/2026"])).toEqual({ format: "mdy", ambiguous: false }));
  it("flags fully ambiguous columns", () => expect(inferDateFormat(["03/04/2026", "05/06/2026"])).toEqual({ format: "mdy", ambiguous: true }));
  it("parses many formats", () => {
    expect(parseDate("2026-01-05", "mdy", 2026).iso).toBe("2026-01-05");
    expect(parseDate("Jan 5, 2026", "mdy", 2026).iso).toBe("2026-01-05");
    expect(parseDate("5 Jan 2026", "mdy", 2026).iso).toBe("2026-01-05");
    expect(parseDate("03/04/2026", "dmy", 2026).iso).toBe("2026-04-03");
    expect(parseDate("46027", "mdy", 2026).iso).toBe("2026-01-05"); // Excel serial
    expect(parseDate("Feb 30 2026", "mdy", 2026).iso).toBeNull();
    expect(parseDate("??", "mdy", 2026).iso).toBeNull();
  });
  it("marks inferred years", () => expect(parseDate("Mar 3", "mdy", 2025)).toMatchObject({ iso: "2025-03-03", yearInferred: true }));
});

describe("milestone flags", () => {
  it("reads yes/no/check marks/dates", () => {
    expect(normalizeFlag("Yes").value).toBe(true);
    expect(normalizeFlag("✓").value).toBe(true);
    expect(normalizeFlag("2026-02-01")).toEqual({ value: true, viaDate: true });
    expect(normalizeFlag("no").value).toBe(false);
    expect(normalizeFlag("").value).toBeNull();
    expect(normalizeFlag("n/a").value).toBeNull();
  });
});
