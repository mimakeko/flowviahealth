import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

const siteUrl = "https://flowviahealth.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Flowvia Health | Smarter Care Coordination", template: "%s | Flowvia Health" },
  description: "Healthcare workflow and patient communication technology for home health therapy coordination.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Flowvia Health",
    title: "Flowvia Health | Smarter Care Coordination",
    description: "Modern scheduling, patient communication, and care-team workflow technology for home health therapy.",
  },
  twitter: { card: "summary_large_image", title: "Flowvia Health", description: "Smarter care coordination for home health therapy." },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="sr-only z-[100] rounded bg-white px-4 py-2 text-blue focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
