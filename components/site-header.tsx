import Link from "next/link";
import { Logo } from "./logo";

const nav = [
  { href: "/#platform", label: "Platform" },
  { href: "/sms-consent", label: "SMS Consent" },
  { href: "/hipaa", label: "HIPAA & Security" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-white/95 backdrop-blur">
      <div className="container-page flex h-[78px] items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
          {nav.map((item) => <Link key={item.href} href={item.href} className="text-sm font-medium text-slate-700 transition hover:text-blue">{item.label}</Link>)}
        </nav>
        <Link href="/sms-consent" className="btn-primary hidden min-h-10 px-4 py-2 text-xs md:inline-flex">View SMS Consent</Link>
        <details className="relative md:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-line text-ink [&::-webkit-details-marker]:hidden" aria-label="Open navigation menu">
            <span className="space-y-1.5"><span className="block h-0.5 w-5 bg-current"/><span className="block h-0.5 w-5 bg-current"/><span className="block h-0.5 w-5 bg-current"/></span>
          </summary>
          <nav className="absolute right-0 top-12 w-64 rounded-2xl border border-line bg-white p-3 shadow-panel" aria-label="Mobile navigation">
            {nav.map((item) => <Link key={item.href} href={item.href} className="block rounded-lg px-4 py-3 text-sm font-medium hover:bg-mist">{item.label}</Link>)}
          </nav>
        </details>
      </div>
    </header>
  );
}
