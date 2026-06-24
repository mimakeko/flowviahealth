import Link from "next/link";
import { Logo } from "./logo";

const links = [
  ["SMS Consent", "/sms-consent"], ["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"],
  ["HIPAA & Security", "/hipaa"], ["Contact", "/contact"],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink text-white">
      <div className="container-page py-12">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
          <Logo compact dark />
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3">
            {links.map(([label, href]) => <Link key={href} href={href} className="text-sm font-medium text-white/70 transition hover:text-teal">{label}</Link>)}
          </nav>
        </div>
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs leading-5 text-white/50 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-x-5 gap-y-2"><a href="mailto:support@flowviahealth.com" className="transition hover:text-teal">support@flowviahealth.com</a><p>© 2026 Flowvia Health</p></div>
          <p>This website is for product information only. Do not submit protected health information.</p>
        </div>
      </div>
    </footer>
  );
}
