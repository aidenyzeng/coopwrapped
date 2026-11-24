import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "co-wrapped — your co-op search, as a story",
  description:
    "Paste your co-op application tracker and get a personalized, shareable recap. Your spreadsheet is processed in your browser and never uploaded.",
  openGraph: {
    title: "Co-wrapped",
    description: "Turn your application spreadsheet into a story worth posting. Private by default.",
    images: [{ url: "/api/og/sample", width: 1200, height: 630, alt: "A sample Co-wrapped card" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#121116",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* Allo is used for the chrome on every page; the story/card font is preloaded only where it's used */}
        <link rel="preload" href="/fonts/allo.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
