"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/events/track";

/** Tiny client island so the landing page itself stays a server component. */
export function TrackedLink({
  href,
  event,
  sample,
  position = "hero",
  className,
  children,
}: {
  href: string;
  event: "landing_cta" | "sample";
  sample?: "marathoner" | "closer" | "optimist";
  position?: "hero" | "footer";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (event === "landing_cta") track("landing_cta", { position });
      }}
      data-sample={sample}
    >
      {children}
    </Link>
  );
}
