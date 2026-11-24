"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Metrics } from "@/lib/analytics/metrics";
import type { PersonaResult } from "@/lib/persona/personas";
import { cardFromSummary, summaryFromMetrics } from "@/lib/share/card-data";
import { CARD_STYLES, type CardStyle, type PublicSummaryV1 } from "@/lib/share/payload";
import { availableStats, statDisplay, type StatKey } from "@/lib/share/stats";
import { captionSuggestions, type CaptionTone } from "@/lib/share/captions";
import type { CardSize } from "@/lib/card/render";
import { track } from "@/lib/events/track";
import { CardCanvas } from "./CardCanvas";
import { canShareFiles, download, renderCardBlob, shareOrDownload } from "./exporters";

export interface ShareState {
  style: CardStyle;
  selected: StatKey[];
  showCompany: boolean;
}

export function buildSummary(metrics: Metrics, persona: PersonaResult, seed: number, s: ShareState): PublicSummaryV1 {
  return summaryFromMetrics(metrics, persona, s.selected, s.style, seed);
}

const STYLE_INFO: Record<CardStyle, { label: string; hint: string }> = {
  achievement: { label: "Achievement", hint: "Clean and confident — LinkedIn" },
  comedy: { label: "Comedy", hint: "Self-aware — X" },
  minimal: { label: "Minimal", hint: "Big type, nothing extra" },
};

const noopSubscribe = () => () => {};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cowrapped.app").replace(/\/$/, "");

interface Props {
  open: boolean;
  onClose: () => void;
  metrics: Metrics;
  persona: PersonaResult;
  seed: number;
  topCompany?: { name: string; count: number };
  state: ShareState;
  setState: (s: ShareState) => void;
  initialTab?: "card" | "why";
}

export function ShareSheet({ open, onClose, metrics, persona, seed, topCompany, state, setState, initialTab = "card" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [size, setSize] = useState<CardSize>("story");
  const [tone, setTone] = useState<CaptionTone>("professional");
  const [captionIdx, setCaptionIdx] = useState(0);
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ id: string; token: string } | null>(null);
  const [linkError, setLinkError] = useState("");
  // Confirmation is tied to the exact summary shown; any card change requires re-confirming.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const whyRef = useRef<HTMLDetailsElement>(null);

  const avail = useMemo(() => availableStats(metrics), [metrics]);
  const summary = useMemo(() => buildSummary(metrics, persona, seed, state), [metrics, persona, seed, state]);
  const companyLine =
    state.showCompany && topCompany ? `Most applied: ${topCompany.name} ×${topCompany.count}` : undefined;
  const card = useMemo(() => cardFromSummary(summary, { companyLine }), [summary, companyLine]);
  const captions = useMemo(() => captionSuggestions(summary, SITE.replace(/^https?:\/\//, "")), [summary]);

  const suggested = captions[tone][captionIdx % captions[tone].length];
  const caption = captionEdits[suggested] ?? suggested;
  const setCaption = (t: string) => setCaptionEdits((e) => ({ ...e, [suggested]: t }));
  const summaryKey = JSON.stringify(summary);
  const confirmLink = confirmedFor === summaryKey;
  const setConfirmLink = (v: boolean) => setConfirmedFor(v ? summaryKey : null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      if (initialTab === "why" && whyRef.current) {
        whyRef.current.open = true;
        whyRef.current.scrollIntoView({ block: "start" });
      }
    } else if (!open && d.open) d.close();
  }, [open, initialTab]);

  const toggleStat = (k: StatKey) => {
    const has = state.selected.includes(k);
    if (!has && state.selected.length >= 3) return;
    setState({ ...state, selected: has ? state.selected.filter((x) => x !== k) : [...state.selected, k] });
  };

  const exportCard = async () => {
    setBusy(true);
    setNotice("");
    try {
      const blob = await renderCardBlob(card, size);
      const res = await shareOrDownload(blob, `co-wrapped-${state.style}-${size === "story" ? "1080x1920" : "1200x630"}.png`, caption);
      track("export", { style: state.style, size });
      if (res !== "cancelled") track("share_action", { method: res, style: state.style });
      setNotice(res === "download" ? "Saved the image. Attach it to your post." : res === "web_share" ? "Handed off to your share sheet." : "");
    } catch {
      setNotice("Couldn’t create the image. Try again?");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Save the card, then open the network's composer with the caption filled in.
   * The window is opened synchronously so popup blockers allow it. Intents can't
   * carry an image, so the user attaches the file that was just saved.
   */
  const postTo = async (net: "x" | "linkedin") => {
    const w = window.open("about:blank", "_blank");
    if (w) w.opener = null;
    setBusy(true);
    try {
      const blob = await renderCardBlob(card, size);
      download(blob, `co-wrapped-${state.style}-${size === "story" ? "1080x1920" : "1200x630"}.png`);
      track("export", { style: state.style, size });
      track("share_action", { method: net === "x" ? "x_intent" : "linkedin_intent", style: state.style });
      const text = encodeURIComponent(caption);
      const url = net === "x" ? `https://x.com/intent/post?text=${text}` : `https://www.linkedin.com/feed/?shareActive=true&text=${text}`;
      if (w) w.location.href = url;
      else window.open(url, "_blank", "noopener");
      setNotice("Image saved. Attach it to your post — the caption is already filled in.");
    } catch {
      w?.close();
      setNotice("Couldn’t create the image. Try again?");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, method: "copy_caption" | "copy_link") => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(method === "copy_caption" ? "Caption copied." : "Link copied.");
      track("share_action", { method });
    } catch {
      setNotice("Copy failed — select the text and copy it manually.");
    }
  };

  const createLink = async () => {
    setBusy(true);
    setLinkError("");
    try {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(summary) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn’t create a link.");
      setLink({ id: body.id, token: body.deleteToken });
      try {
        localStorage.setItem(`cw_del_${body.id}`, body.deleteToken);
      } catch {}
      track("share_link_created", { stats: summary.stats.length });
    } catch (e) {
      setLinkError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmLink(false);
    }
  };

  const deleteLink = async () => {
    if (!link) return;
    setBusy(true);
    const res = await fetch(`/api/share/${link.id}`, { method: "DELETE", headers: { "x-delete-token": link.token } });
    setBusy(false);
    if (res.ok || res.status === 404) {
      try {
        localStorage.removeItem(`cw_del_${link.id}`);
      } catch {}
      setLink(null);
      setNotice("Link deleted. It no longer works for anyone.");
      track("share_link_deleted", {});
    } else setNotice("Couldn’t delete the link. Try again.");
  };

  const linkUrl = link ? `${window.location.origin}/r/${link.id}` : "";
  // Server render assumes no Web Share; the client value is read after hydration (no mismatch).
  const webShare = useSyncExternalStore(noopSubscribe, canShareFiles, () => false);
  const seg = "press rounded-full px-3.5 py-2 text-sm font-bold border-2 border-ink";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="share-title"
      // light-dismiss: tapping the backdrop closes the sheet (native, no JS)
      {...{ closedby: "any" }}
      className="share-sheet m-0 ml-auto h-dvh max-h-dvh w-full max-w-[560px] overflow-y-auto bg-paper p-0 text-ink sm:my-0"
      data-testid="share-sheet"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-ink bg-paper px-5 py-3">
        <h2 id="share-title" className="text-xl font-extrabold tracking-tight">
          Share your card
        </h2>
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border-2 border-ink" aria-label="Close share options">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      </div>

      <div className="space-y-7 px-5 pb-10 pt-5">
        {/* style + size */}
        <fieldset>
          <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em]">Style</legend>
          <div className="grid grid-cols-3 gap-2">
            {CARD_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={state.style === s}
                onClick={() => setState({ ...state, style: s })}
                className={`rounded-2xl border-2 border-ink px-2 py-2.5 text-left ${state.style === s ? "bg-ink text-paper" : "bg-paper"}`}
                data-testid={`style-${s}`}
              >
                <span className="block text-sm font-extrabold">{STYLE_INFO[s].label}</span>
                <span className="block text-[11px] leading-tight opacity-80">{STYLE_INFO[s].hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2" role="group" aria-label="Image size">
            {(["story", "landscape"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)} className={`${seg} ${size === s ? "bg-ink text-paper" : ""}`} data-testid={`size-${s}`}>
                {s === "story" ? "Story · 1080×1920" : "Post · 1200×630"}
              </button>
            ))}
          </div>
        </fieldset>

        {/* exact preview */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em]">Exactly what will be shared</p>
          <div className={`mx-auto overflow-hidden rounded-xl border-2 border-ink shadow-[4px_4px_0_var(--ink)] ${size === "story" ? "w-[min(100%,300px)]" : "w-full"}`}>
            <CardCanvas data={card} size={size} className="block h-auto w-full" label={`Preview: ${card.total} applications, ${card.personaName}. ${card.stats.map((s) => `${s.value} ${s.label}`).join(", ")}`} />
          </div>
        </div>

        {/* stats */}
        <fieldset>
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.14em]">Stats on the card ({state.selected.length}/3)</legend>
          {avail.length === 0 ? (
            <p className="text-sm text-muted">Your data doesn’t support extra stats yet — the card shows your total and persona.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {avail.map((s) => {
                const d = statDisplay(s);
                const checked = state.selected.includes(s.key);
                const disabled = !checked && state.selected.length >= 3;
                return (
                  <li key={s.key}>
                    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 ${checked ? "border-ink bg-white/60" : "border-line"} ${disabled ? "opacity-50" : ""}`}>
                      <input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={checked} disabled={disabled} onChange={() => toggleStat(s.key)} />
                      <span className="tabular min-w-12 text-lg font-extrabold">{d.value}</span>
                      <span className="text-sm">{d.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {topCompany ? (
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={state.showCompany} onChange={(e) => setState({ ...state, showCompany: e.target.checked })} />
              <span>
                Show a company name on the image{" "}
                <span className="text-muted">(off by default · never included in share links)</span>
              </span>
            </label>
          ) : null}
        </fieldset>

        {/* actions */}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary flex-1" onClick={exportCard} disabled={busy} data-testid="export-card">
            {webShare ? "Share image" : "Download image"}
          </button>
          {webShare ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                const blob = await renderCardBlob(card, size);
                download(blob, `co-wrapped-${state.style}-${size === "story" ? "1080x1920" : "1200x630"}.png`);
                track("export", { style: state.style, size });
                track("share_action", { method: "download", style: state.style });
              }}
            >
              Download
            </button>
          ) : null}
        </div>
        {/* one-click posting: save the image, open the network's composer with the caption */}
        <div className="-mt-3 flex flex-wrap gap-2" role="group" aria-label="Post directly">
          <button type="button" className={`${seg} press flex items-center gap-2`} onClick={() => postTo("x")} disabled={busy} data-testid="post-x">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" /></svg>
            Post on X
          </button>
          <button type="button" className={`${seg} press flex items-center gap-2`} onClick={() => postTo("linkedin")} disabled={busy} data-testid="post-linkedin">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11.25H3V9.75Zm6.5 0h3.8v1.6h.06c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.77 2.65 4.77 6.1V21h-4v-4.95c0-1.18-.02-2.7-1.65-2.7-1.65 0-1.9 1.29-1.9 2.62V21h-4V9.75Z" /></svg>
            Share on LinkedIn
          </button>
        </div>
        <p className="text-sm text-muted" aria-live="polite" data-testid="share-notice">
          {notice}
        </p>

        {/* caption */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Caption</p>
            <div className="flex gap-1.5" role="group" aria-label="Caption tone">
              {(["professional", "playful"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tone === t} onClick={() => { setTone(t); setCaptionIdx(0); }} className={`${seg} px-3 py-1 text-xs ${tone === t ? "bg-ink text-paper" : ""}`}>
                  {t === "professional" ? "Professional" : "Playful"}
                </button>
              ))}
            </div>
          </div>
          <label htmlFor="caption" className="sr-only">Caption (editable)</label>
          <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={8} className="w-full rounded-xl border-2 border-ink bg-white/70 p-3 text-[15px] leading-relaxed" />
          <div className="mt-2 flex gap-2">
            <button type="button" className={seg} onClick={() => setCaptionIdx((i) => i + 1)}>Another idea</button>
            <button type="button" className={seg} onClick={() => copy(caption, "copy_caption")}>Copy caption</button>
          </div>
        </div>

        {/* public link */}
        <section aria-labelledby="link-title" className="rounded-2xl border-2 border-ink p-4">
          <h3 id="link-title" className="text-lg font-extrabold">Public replay link <span className="text-sm font-semibold text-muted">(optional)</span></h3>
          {link ? (
            <div className="mt-3 space-y-3">
              <p className="break-all rounded-lg bg-white/70 p-2 font-mono text-sm" data-testid="share-link">{linkUrl}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={seg} onClick={() => copy(linkUrl, "copy_link")}>Copy link</button>
                <a className={seg} href={linkUrl} target="_blank" rel="noreferrer">Open</a>
                <button type="button" className={`${seg} border-tomato text-[#a3260b]`} onClick={deleteLink} disabled={busy} data-testid="delete-link">Delete link</button>
              </div>
              <p className="text-xs text-muted">Deleting works from this browser. Anyone with the link can see these stats until you delete it (links expire after a year).</p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm">Anyone with the link sees an animated replay of your card. Only this is stored:</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-white/60 p-3 text-sm" data-testid="public-preview">
                <dt className="font-bold">Persona</dt><dd>{card.personaName}</dd>
                <dt className="font-bold">Applications</dt><dd className="tabular">{summary.total}</dd>
                {summary.stats.map((s) => {
                  const d = statDisplay(s);
                  return (
                    <div key={s.key} className="contents"><dt className="font-bold tabular">{d.value}</dt><dd>{d.label}</dd></div>
                  );
                })}
                <dt className="font-bold">Card style</dt><dd>{STYLE_INFO[summary.style].label}</dd>
              </dl>
              <p className="mt-2 text-xs text-muted">Never stored: your spreadsheet, company names, roles, dates, or your caption. Treat these numbers as public once shared.</p>
              {linkError ? <p className="mt-2 text-sm font-semibold text-[#a3260b]" role="alert">{linkError}</p> : null}
              {confirmLink ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={createLink} disabled={busy} data-testid="confirm-create-link">Yes, make it public</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirmLink(false)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="btn btn-secondary mt-3" onClick={() => setConfirmLink(true)} data-testid="create-link">Create share link</button>
              )}
            </>
          )}
        </section>

        {/* why this persona */}
        <details ref={whyRef} className="rounded-2xl border-2 border-ink p-4" data-testid="why-persona">
          <summary className="cursor-pointer text-lg font-extrabold">Why “{persona.name}”?</summary>
          <p className="mt-2 text-sm"><strong>Rule matched:</strong> {persona.why.matched}</p>
          <p className="mt-1 text-sm">{persona.sentence}</p>
          {persona.why.skipped.length ? (
            <>
              <p className="mt-3 text-sm font-bold">Checked first, didn’t apply:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
                {persona.why.skipped.map((s) => (
                  <li key={s.name}>{s.name} — {s.rule}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-3 text-xs text-muted">Rules are checked in a fixed order and the first match wins, so the same data always gets the same persona.</p>
        </details>
      </div>
    </dialog>
  );
}
