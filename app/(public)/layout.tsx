import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a href="#main-content" className="sr-only z-[100] rounded bg-white px-4 py-2 text-blue focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </>
  );
}
