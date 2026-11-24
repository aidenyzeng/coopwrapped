import { importText, type ImportOptions } from "./build";
import type { ImportResult } from "../model/types";

/** Above this size we parse in a Web Worker so the UI stays responsive. */
export const WORKER_THRESHOLD = 150_000; // characters (~1,500+ rows)
export const MAX_INPUT = 5_000_000;

let worker: Worker | null = null;
let seq = 0;

export async function runImport(text: string, opts: ImportOptions): Promise<ImportResult> {
  if (text.length < WORKER_THRESHOLD || typeof Worker === "undefined") return importText(text, opts);
  worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const w = worker!;
    const onMsg = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (e.data.ok) resolve(e.data.result as ImportResult);
      else reject(new Error(e.data.error));
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, text, opts });
  });
}
