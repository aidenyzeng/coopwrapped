/**
 * Core typed model. Everything downstream of import works on these types;
 * raw spreadsheet rows never leave the import layer except as `raw` strings
 * kept for provenance display in the review step (in-browser only).
 */

export type FieldKey =
  | "company"
  | "role"
  | "status"
  | "appliedDate"
  | "interviewDate"
  | "interviewFlag"
  | "offerFlag"
  | "acceptedFlag"
  | "location"
  | "notes";

export const FIELD_LABELS: Record<FieldKey, string> = {
  company: "Company",
  role: "Role",
  status: "Status",
  appliedDate: "Applied date",
  interviewDate: "Interview date",
  interviewFlag: "Interviewed?",
  offerFlag: "Offer?",
  acceptedFlag: "Accepted?",
  location: "Location",
  notes: "Notes",
};

/** Normalized current-status buckets. */
export type Status =
  | "applied" // submitted, waiting, in review — no recorded response
  | "no_response" // explicitly marked as no reply / ghosted by the user
  | "rejected"
  | "screening" // assessment / OA / recruiter screen — a response, not an interview
  | "interviewing" // currently in an interview stage
  | "offer" // offer received, decision not recorded
  | "accepted"
  | "declined" // offer declined by the student
  | "withdrawn" // student withdrew
  | "unknown"; // status column present but value not recognised

export type Tri = true | false | null; // null = not recorded / unknown

export type DateFormat = "ymd" | "mdy" | "dmy";

/** Where a value came from. */
export type Provenance = "direct" | "normalized" | "inferred" | "missing";

export interface Field<T> {
  value: T;
  raw: string;
  provenance: Provenance;
  /** Human note for normalized/inferred values, e.g. "“Rejected 😭” → rejected" */
  note?: string;
}

export interface Application {
  /** 0-based index of the source data row (after header). */
  row: number;
  company: Field<string>;
  /** Normalisation key used for grouping; never shown publicly. */
  companyKey: string;
  role: Field<string | null>;
  status: Field<Status | null>; // null when no status column
  appliedDate: Field<string | null>; // ISO yyyy-mm-dd
  /** Interview evidence from a milestone column (date or flag). null = no column / blank. */
  interviewed: Field<Tri>;
  offer: Field<Tri>;
  accepted: Field<Tri>;
}

export interface ColumnMapping {
  /** column index → field (or null = ignored) */
  byColumn: (FieldKey | null)[];
  /** confidence per column, 0..1 */
  confidence: number[];
  /** why each column was mapped */
  reasons: string[];
  dateFormat: DateFormat;
  dateFormatAmbiguous: boolean;
}

export type IssueKind =
  | "missing_company"
  | "unknown_status"
  | "unparsed_date"
  | "ambiguous_date"
  | "future_date"
  | "exact_duplicate"
  | "possible_duplicate"
  | "company_merged"
  | "accepted_without_offer_flag";

export interface Issue {
  kind: IssueKind;
  rows: number[];
  message: string;
  /** issues that need a human look are "warn"; informational ones are "info" */
  level: "warn" | "info";
  /** for unknown_status issues: the cleaned wording, used as the override key */
  statusKey?: string;
}

export interface ImportResult {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  mapping: ColumnMapping;
  applications: Application[];
  /** rows excluded from analysis (blank rows, rows w/o company, excluded duplicates) */
  excludedRows: number[];
  issues: Issue[];
}
