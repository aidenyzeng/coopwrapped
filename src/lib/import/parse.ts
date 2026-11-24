import Papa from "papaparse";

export interface ParsedTable {
  rows: string[][]; // includes header row if any
  delimiter: string;
}

/**
 * Parse pasted text or CSV file contents into a rectangular string table.
 * Pastes from Google Sheets / Excel / Numbers arrive as TSV; files as CSV
 * (sometimes semicolon-delimited in European locales). Papa's delimiter
 * guessing handles all three; we pre-pick tab when every non-empty line has one.
 */
export function parseTable(text: string): ParsedTable {
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = cleaned.split("\n").filter((l) => l.trim() !== "");
  const tabby = lines.length > 0 && lines.filter((l) => l.includes("\t")).length >= Math.ceil(lines.length * 0.8);
  const result = Papa.parse<string[]>(cleaned, {
    delimiter: tabby ? "\t" : "",
    delimitersToGuess: [",", "\t", ";", "|"],
    skipEmptyLines: "greedy",
  });
  const width = Math.max(0, ...result.data.map((r) => r.length));
  const rows = result.data
    .map((r) => {
      const out = r.map((c) => (c ?? "").toString().trim());
      while (out.length < width) out.push("");
      return out;
    })
    // drop fully-empty rows
    .filter((r) => r.some((c) => c !== ""));
  // drop fully-empty columns
  const keep: number[] = [];
  for (let c = 0; c < width; c++) if (rows.some((r) => r[c] !== "")) keep.push(c);
  return {
    rows: rows.map((r) => keep.map((c) => r[c])),
    delimiter: result.meta.delimiter,
  };
}

/** Strip leading title rows like "My Co-op Search 2025" (a single filled cell above the table). */
export function stripTitleRows(rows: string[][]): { rows: string[][]; skipped: number } {
  let skipped = 0;
  while (rows.length > 2 && rows[0].filter((c) => c !== "").length === 1 && rows[1].filter((c) => c !== "").length >= 2) {
    rows = rows.slice(1);
    skipped++;
  }
  return { rows, skipped };
}
