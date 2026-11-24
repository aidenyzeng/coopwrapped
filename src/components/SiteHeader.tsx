import Link from "next/link";
import type { ReactNode } from "react";

/** Minimal header for inner pages, matching the landing page: wordmark left, quiet links right. */
export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="font-allo relative z-20 shrink-0 bg-[#fbfbfa]">
      <svg width="0" height="0" aria-hidden className="absolute">
        <filter id="ink-sm" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncA type="linear" slope="2.5" intercept="-0.5" />
          </feComponentTransfer>
        </filter>
      </svg>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="press wordmark-sm text-[24px] tracking-[-0.045em]" aria-label="co-wrapped home">
          co-wrapped
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-[15px] text-ink/60">
          {right ?? (
            <>
              <Link href="/sample/marathoner" className="hidden hover:text-ink sm:inline">Samples</Link>
              <Link href="/make" className="hover:text-ink">Make yours</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
