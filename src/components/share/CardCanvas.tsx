"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_SIZES, drawCard, ensureCardFonts, type CardSize } from "@/lib/card/render";
import type { CardData } from "@/lib/share/card-data";

/**
 * Live preview: draws the card at full export resolution with the exact export
 * renderer, then scales it down with CSS. What you see is what gets shared.
 */
export function CardCanvas({ data, size, className, label }: { data: CardData; size: CardSize; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const { w, h } = CARD_SIZES[size];
  useEffect(() => {
    let alive = true;
    ensureCardFonts().then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      drawCard(c.getContext("2d")!, data, size);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [data, size]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      role="img"
      aria-label={label}
      data-ready={ready ? "true" : "false"}
      className={className}
      style={{ aspectRatio: `${w} / ${h}`, opacity: ready ? 1 : 0, transition: "opacity 200ms" }}
    />
  );
}
