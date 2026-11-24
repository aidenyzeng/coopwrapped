import Link from "next/link";
import type { ReactNode } from "react";

/** Minimal header for inner pages, matching the landing page: wordmark left, quiet links right. */
export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="relative z-20 shrink-0 bg-[#fbfbfa]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="wordmark-sm text-[22px] font-semibold tracking-[-0.05em]">
          co-op wrapped
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-[15px] text-ink/60">
          {right ?? (
            <>
              <Link href="/how-it-works" className="hidden hover:text-ink sm:inline">How it works</Link>
              <Link href="/sample/marathoner" className="hidden hover:text-ink sm:inline">Samples</Link>
              <Link href="/make" className="hover:text-ink">Make yours</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
