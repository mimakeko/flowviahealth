import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

const siteUrl = "https://flowviahealth.com";
const parentCompanyUrl = "https://www.onzeonholdings.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Flowvia Health | Smarter Care Coordination", template: "%s | Flowvia Health" },
  description: "Flowvia Health is a healthcare workflow, scheduling, care coordination, and transactional healthcare messaging platform owned, developed, and operated by Onzeon Holdings LLC.",
  keywords: [
    "Flowvia Health",
    "Onzeon Holdings LLC",
    "healthcare workflow platform",
    "scheduling platform",
    "care coordination platform",
    "transactional healthcare messaging",
    "home health therapy",
    "patient communication",
    "appointment reminders",
    "care coordination",
    "SMS consent",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Flowvia Health",
    title: "Flowvia Health | Smarter Care Coordination",
    description: "Healthcare workflow, scheduling, care coordination, and transactional healthcare messaging owned, developed, and operated by Onzeon Holdings LLC.",
  },
  twitter: { card: "summary_large_image", title: "Flowvia Health", description: "Healthcare workflow, scheduling, care coordination, and transactional healthcare messaging owned, developed, and operated by Onzeon Holdings LLC." },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Flowvia Health",
  url: siteUrl,
  email: "support@flowviahealth.com",
  parentOrganization: {
    "@type": "Organization",
    name: "Onzeon Holdings LLC",
    url: parentCompanyUrl,
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@flowviahealth.com",
      url: `${siteUrl}/contact`,
    },
    {
      "@type": "ContactPoint",
      contactType: "privacy and SMS consent",
      email: "privacy@flowviahealth.com",
      url: `${siteUrl}/privacy`,
    },
  ],
  makesOffer: {
    "@type": "Offer",
    itemOffered: {
      "@type": "SoftwareApplication",
      name: "Flowvia Health",
      applicationCategory: "HealthcareApplication",
      operatingSystem: "Web",
      description:
        "Healthcare workflow, scheduling, care coordination, and transactional healthcare messaging platform for home health therapy coordination.",
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <a href="#main-content" className="sr-only z-[100] rounded bg-white px-4 py-2 text-blue focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
