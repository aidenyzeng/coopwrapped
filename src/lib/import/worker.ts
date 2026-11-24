/// <reference lib="webworker" />
import { importText, type ImportOptions } from "./build";

// Parses and normalizes large pastes/files off the main thread. Data never leaves the browser.
self.onmessage = (e: MessageEvent<{ id: number; text: string; opts: ImportOptions }>) => {
  const { id, text, opts } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, ok: true, result: importText(text, opts) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
