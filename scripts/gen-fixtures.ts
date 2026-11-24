/**
 * Generates deterministic, realistic (but fictional) application trackers.
 * Output: fixtures/*.{csv,tsv} + fixtures/expected.json (labeled column mappings)
 *         src/lib/samples/data.ts (three polished sample datasets for the app)
 * Run: npx tsx scripts/gen-fixtures.ts
 */
import fs from "node:fs";
import path from "node:path";
import { rng } from "../src/lib/design/tokens";

const ROOT = path.join(__dirname, "..");
const FIX = path.join(ROOT, "fixtures");
fs.mkdirSync(FIX, { recursive: true });

const COMPANIES = [
  "Northwind Labs", "Maple Byte", "Lakeshore Robotics", "Quill Analytics", "Bluefin Health", "Cedar & Pine Studio", "Orbital Freight",
  "Granite Bank", "Pixelhaus", "Tundra Systems", "Harbourline", "Kestrel AI", "Lumen Grid", "Redwood Insurance", "Saffron Foods",
  "Polar Payments", "Brightside Ed", "Copperleaf", "Driftwood Games", "Evergreen Energy", "Foxglove Bio", "Gullwing Aero",
  "Hollow Oak Media", "Inkwell Docs", "Juniper Cloud", "Kite Mobility", "Larkspur Retail", "Moonbeam Devices", "Nimbus Data",
  "Otter Logistics", "Prairie Telecom", "Quartz Security", "Riverstone Capital", "Sable Semiconductors", "Thistle Software",
  "Umber Analytics", "Vantage Civic", "Willow Health", "Xylo Audio", "Yarrow Farms", "Zephyr Mobility", "Atlas Municipal",
  "Beacon Credit Union", "Cobalt Mining Tech", "Dune Robotics", "Ember Fintech", "Fjord Maps", "Glacier Water Co", "Heron Labs",
  "Iris Optics", "Jasper Legal Tech", "Koala Kids", "Lattice Quantum", "Mosaic Marketing", "Nova Transit", "Opal Insurance",
  "Pebble Wearables", "Quokka Travel", "Rook Chess Co", "Summit Outdoor", "Tidepool Ocean Tech", "Upland Ag", "Vesper Hotels",
  "Wren Publishing", "Yonder VR", "Zinc Hardware", "Aurora Grid", "Bramble Commerce", "Canopy Climate", "Delta Diagnostics",
];
const ROLES = [
  "Software Developer Co-op", "Data Analyst Intern", "Backend Engineer Co-op", "Frontend Developer Intern", "Product Design Co-op",
  "QA Automation Co-op", "Machine Learning Intern", "DevOps Co-op", "Business Analyst Co-op", "Full Stack Developer Co-op",
  "Embedded Software Intern", "IT Support Co-op", "Product Manager Intern", "Research Assistant Co-op", "Mobile Developer Co-op",
];

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
function addDays(iso: string, d: number) {
  const t = new Date(iso + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
const mdy = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const dmy = (iso: string) => `${pad(+iso.slice(8, 10))}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

function csvCell(v: string, d: string) {
  return v.includes(d) || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
}
function toText(headers: string[] | null, rows: string[][], d: string) {
  const lines = (headers ? [headers, ...rows] : rows).map((r) => r.map((c) => csvCell(c, d)).join(d));
  return lines.join("\n") + "\n";
}

interface GenOpts {
  n: number;
  seed: number;
  start: string;
  spanDays: number;
  /** distribution of outcomes */
  weights: Partial<Record<"applied" | "rejected" | "rejected_int" | "interview" | "oa" | "offer" | "accepted" | "ghost" | "withdrawn", number>>;
  burst?: { at: number; share: number }; // fraction of apps in a 7-day burst starting at day `at`
  weekendBias?: number;
}

interface App {
  company: string;
  role: string;
  date: string;
  outcome: string;
  interviewed: boolean;
}

function generate(o: GenOpts): App[] {
  const r = rng(o.seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const entries = Object.entries(o.weights) as [string, number][];
  const totalW = entries.reduce((s, [, w]) => s + w, 0);
  const apps: App[] = [];
  for (let i = 0; i < o.n; i++) {
    let x = r() * totalW;
    let outcome = entries[0][0];
    for (const [k, w] of entries) {
      if ((x -= w) <= 0) {
        outcome = k;
        break;
      }
    }
    let day = o.burst && r() < o.burst.share ? o.burst.at + Math.floor(r() * 7) : Math.floor(Math.pow(r(), 1.3) * o.spanDays);
    let date = addDays(o.start, day);
    const wd = new Date(date + "T00:00:00Z").getUTCDay();
    if ((wd === 0 || wd === 6) && r() > (o.weekendBias ?? 0.3)) date = addDays(date, wd === 6 ? 2 : 1);
    const interviewed = ["interview", "offer", "accepted", "rejected_int"].includes(outcome) ? true : outcome === "offer" || outcome === "accepted" ? r() < 0.9 : false;
    apps.push({ company: pick(COMPANIES), role: pick(ROLES), date, outcome, interviewed });
    void day;
    day = 0;
  }
  return apps.sort((a, b) => a.date.localeCompare(b.date));
}

const STATUS_WORDS: Record<string, string[]> = {
  applied: ["Applied", "Applied", "Submitted", "In review", "Pending"],
  rejected: ["Rejected", "Rejected", "Not selected", "Rejected"],
  rejected_int: ["Rejected after interview", "Rejected (final round)", "Rejected"],
  interview: ["Interviewing", "Interview scheduled", "Interview"],
  oa: ["OA", "Online assessment", "Coding challenge"],
  offer: ["Offer", "Offer received"],
  accepted: ["Accepted", "Accepted offer"],
  ghost: ["Ghosted", "No response", ""],
  withdrawn: ["Withdrew", "Withdrawn"],
};

const expected: Record<string, { mapping: Record<string, string>; notes: string }> = {};

function write(name: string, text: string, mapping: Record<string, string>, notes: string) {
  fs.writeFileSync(path.join(FIX, name), text);
  expected[name] = { mapping, notes };
}

function statusWord(r: () => number, outcome: string) {
  const w = STATUS_WORDS[outcome];
  return w[Math.floor(r() * w.length)];
}

/* 1. Messy headers, title row, emoji, junk columns, Sheets paste (TSV) */
{
  const r = rng(11);
  const apps = generate({ n: 45, seed: 1, start: "2026-01-05", spanDays: 60, weights: { applied: 4, rejected: 4, rejected_int: 1, interview: 2, oa: 1, ghost: 2, offer: 1 } });
  const headers = [" Company Name ", "Position Title", "Link", "Current Status 🙃", "Date Applied (mm/dd)", "Interview?", "Notes"];
  const rows = apps.map((a) => [
    a.company, a.role, `https://jobs.example.com/${Math.floor(r() * 99999)}`, statusWord(r, a.outcome) + (r() < 0.15 ? " 😭" : ""), mdy(a.date),
    a.interviewed ? (r() < 0.5 ? "yes" : "Y") : r() < 0.5 ? "no" : "", r() < 0.2 ? "referral from a friend, follow up next week" : "",
  ]);
  write("01-messy-headers.tsv", "Winter 2026 co-op hunt\n" + toText(headers, rows, "\t"),
    { "Company Name": "company", "Position Title": "role", "Current Status 🙃": "status", "Date Applied (mm/dd)": "appliedDate", "Interview?": "interviewFlag", Notes: "notes", Link: "notes|null" },
    "Sheets paste with a title row, padded/emoji headers and junk columns");
}

/* 2. Missing dates */
{
  const r = rng(22);
  const apps = generate({ n: 38, seed: 2, start: "2026-01-12", spanDays: 40, weights: { applied: 3, rejected: 3, interview: 1, ghost: 2 } });
  const rows = apps.map((a) => [a.company, a.role, r() < 0.45 ? (r() < 0.2 ? "??" : "") : a.date, statusWord(r, a.outcome)]);
  write("02-missing-dates.csv", toText(["Company", "Role", "Date", "Status"], rows, ","),
    { Company: "company", Role: "role", Date: "appliedDate", Status: "status" }, "~45% blank or unreadable dates");
}

/* 3. Ambiguous statuses */
{
  const words = ["declined", "in progress", "heard back??", "rejected after final round", "OA sent", "ghosted lol", "😭", "phone screen done", "waiting", "offer!!", "they said no", "maybe", "Pending", "position filled", "withdrew"];
  const r = rng(33);
  const apps = generate({ n: 30, seed: 3, start: "2026-02-01", spanDays: 30, weights: { applied: 1 } });
  const rows = apps.map((a, i) => [a.company, a.role, mdy(a.date), words[i % words.length]]);
  void r;
  write("03-ambiguous-statuses.csv", toText(["Employer", "Job Title", "Applied On", "Outcome"], rows, ","),
    { Employer: "company", "Job Title": "role", "Applied On": "appliedDate", Outcome: "status" }, "Free-text and ambiguous statuses");
}

/* 4. Duplicates + company spelling variants */
{
  const base = generate({ n: 24, seed: 4, start: "2026-01-08", spanDays: 30, weights: { applied: 3, rejected: 2, interview: 1 } });
  const r = rng(44);
  const rows: string[][] = base.map((a) => [a.company, a.role, a.date, statusWord(r, a.outcome)]);
  rows.push([...rows[2]], [...rows[2]], [...rows[5]]); // exact dupes
  rows.push(["Shopwise", "Backend Engineer Co-op", "2026-01-10", "Applied"], ["shopwise inc.", "Backend Engineer Co-op", "2026-02-10", "Rejected"], ["SHOPWISE ", "Data Analyst Intern", "2026-01-15", "Interviewing"]);
  rows.push(["Meta Materials", "QA Automation Co-op", "2026-01-12", "Applied"], ["Metal Works Inc", "QA Automation Co-op", "2026-01-12", "Applied"]);
  write("04-duplicates.csv", toText(["company", "role", "applied", "status"], rows, ","),
    { company: "company", role: "role", applied: "appliedDate", status: "status" }, "3 exact duplicates, spelling variants, similar-but-distinct names");
}

/* 5. Tiny */
write("05-tiny.csv", toText(["Company", "Status"], [["Northwind Labs", "Applied"], ["Maple Byte", "Rejected"], ["Kestrel AI", "Interview"], ["Granite Bank", "Applied"]], ","),
  { Company: "company", Status: "status" }, "4 rows, no dates or roles");

/* 6. 300 rows */
{
  const r = rng(66);
  const apps = generate({ n: 300, seed: 6, start: "2025-09-02", spanDays: 120, weights: { applied: 5, rejected: 6, rejected_int: 1, interview: 1, oa: 1, ghost: 3, offer: 0.3, accepted: 0.1 }, burst: { at: 14, share: 0.18 } });
  const rows = apps.map((a) => [a.company, a.role, a.date, statusWord(r, a.outcome), a.interviewed ? addDays(a.date, 10 + Math.floor(r() * 20)) : ""]);
  write("06-large-300.csv", toText(["Company", "Position", "Date Applied", "Status", "Interview Date"], rows, ","),
    { Company: "company", Position: "role", "Date Applied": "appliedDate", Status: "status", "Interview Date": "interviewDate" }, "300 rows with interview dates");
}

/* 7. Zero offers */
{
  const r = rng(77);
  const apps = generate({ n: 62, seed: 7, start: "2026-01-04", spanDays: 70, weights: { applied: 3, rejected: 5, rejected_int: 1, interview: 1, oa: 1, ghost: 2 } });
  const rows = apps.map((a) => [a.company, a.role, mdy(a.date), statusWord(r, a.outcome)]);
  write("07-zero-offers.csv", toText(["Company", "Role", "Date Applied", "Status"], rows, ","),
    { Company: "company", Role: "role", "Date Applied": "appliedDate", Status: "status" }, "No offers recorded");
}

/* 8. Mostly unanswered */
{
  const r = rng(88);
  const apps = generate({ n: 80, seed: 8, start: "2026-09-01", spanDays: 80, weights: { applied: 12, ghost: 3, rejected: 2, interview: 0.5 } });
  const rows = apps.map((a) => [a.company, a.role, a.date, statusWord(r, a.outcome)]);
  write("08-mostly-unanswered.csv", toText(["Company", "Role", "Applied", "Status"], rows, ","),
    { Company: "company", Role: "role", Applied: "appliedDate", Status: "status" }, "~85% no recorded response; several recent");
}

/* 9. No header row, day-first dates */
{
  const r = rng(99);
  const apps = generate({ n: 28, seed: 9, start: "2026-01-13", spanDays: 50, weights: { applied: 2, rejected: 2, interview: 1 } });
  const rows = apps.map((a) => [a.company, dmy(a.date), statusWord(r, a.outcome), a.role]);
  write("09-no-header-dmy.tsv", toText(null, rows, "\t"),
    { "Column A": "company", "Column B": "appliedDate", "Column C": "status", "Column D": "role" }, "No header row; dd/mm/yyyy dates");
}

/* 10. Offer + acceptance milestones, Excel paste */
{
  const r = rng(1010);
  const apps = generate({ n: 41, seed: 10, start: "2026-01-06", spanDays: 45, weights: { applied: 2, rejected: 3, rejected_int: 1, interview: 1, offer: 0.4, accepted: 0.2 } });
  const rows = apps.map((a) => [
    a.company, a.role, monthDay(a.date) + ", 2026", statusWord(r, a.outcome), a.interviewed ? "✓" : "",
    a.outcome === "offer" || a.outcome === "accepted" ? "Yes" : "No", a.outcome === "accepted" ? "Yes" : "",
  ]);
  write("10-milestones.tsv", toText(["Organization", "Role", "Applied", "Stage", "Interviewed?", "Offer?", "Accepted?"], rows, "\t"),
    { Organization: "company", Role: "role", Applied: "appliedDate", Stage: "status", "Interviewed?": "interviewFlag", "Offer?": "offerFlag", "Accepted?": "acceptedFlag" }, "Milestone columns with check marks");
}

/* 11. Semicolon CSV, month names without year */
{
  const r = rng(1111);
  const apps = generate({ n: 22, seed: 11, start: "2026-02-02", spanDays: 25, weights: { applied: 2, rejected: 2, oa: 1 } });
  const rows = apps.map((a) => [statusWord(r, a.outcome), a.company, monthDay(a.date)]);
  write("11-semicolon-monthnames.csv", toText(["Result", "Firm", "When"], rows, ";"),
    { Result: "status", Firm: "company", When: "appliedDate" }, "Semicolon delimited, status first, dates without a year");
}

fs.writeFileSync(path.join(FIX, "expected.json"), JSON.stringify(expected, null, 2) + "\n");

/* ------------------------------------------------------------------ samples */
function sample(apps: App[], seed: number, withInterview: boolean) {
  const r = rng(seed);
  const headers = withInterview ? ["Company", "Role", "Date Applied", "Status", "Interviewed?"] : ["Company", "Role", "Date Applied", "Status"];
  const rows = apps.map((a) => {
    const row = [a.company, a.role, a.date, statusWord(r, a.outcome)];
    if (withInterview) row.push(a.interviewed ? "Yes" : "No");
    return row;
  });
  return toText(headers, rows, "\t");
}
const samples = {
  marathoner: {
    label: "The Marathoner",
    blurb: "128 applications, a big January push",
    text: sample(generate({ n: 128, seed: 201, start: "2026-01-05", spanDays: 75, weights: { applied: 4, rejected: 6, rejected_int: 0.6, interview: 0.4, oa: 1, ghost: 3, withdrawn: 0.3 }, burst: { at: 10, share: 0.12 } }), 2001, true),
  },
  closer: {
    label: "The Closer",
    blurb: "46 applications and a signed offer",
    text: sample(
      (() => {
        const apps = generate({ n: 46, seed: 202, start: "2026-01-07", spanDays: 50, weights: { applied: 2, rejected: 4, rejected_int: 1.5, interview: 0.6, oa: 0.8, ghost: 1.5 } });
        Object.assign(apps[30], { outcome: "accepted", interviewed: true });
        return apps;
      })(),
      2002,
      true,
    ),
  },
  optimist: {
    label: "The Optimist",
    blurb: "64 applications, most still out there",
    text: sample(generate({ n: 64, seed: 203, start: "2026-09-08", spanDays: 60, weights: { applied: 10, ghost: 2, rejected: 1.5, interview: 0.4, oa: 0.4 } }), 2003, false),
  },
};
const out = `// Generated by scripts/gen-fixtures.ts — fictional companies, deterministic.\nexport const SAMPLES = ${JSON.stringify(samples, null, 2)} as const;\n\nexport type SampleId = keyof typeof SAMPLES;\nexport const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];\n`;
fs.mkdirSync(path.join(ROOT, "src/lib/samples"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "src/lib/samples/data.ts"), out);
console.log("fixtures:", Object.keys(expected).length);
