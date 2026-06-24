import Link from "next/link";

// TODO: Replace with final vector logo asset.
export function FlowPathIcon({ className = "h-10 w-12" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 52 48" className={className} fill="none">
      <path d="M7 27C7 14 16 7 29 7H42" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M13 35C13 23 21 16 33 16H42" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M20 43C20 32 27 25 38 25H42" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="42" cy="7" r="3.5" fill="#1D4EDB" />
      <circle cx="42" cy="16" r="3.5" fill="#00B2A9" />
      <circle cx="42" cy="25" r="3.5" fill="#1D4EDB" />
    </svg>
  );
}

export function LogoLockup({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${dark ? "text-white" : "text-ink"}`}>
      <FlowPathIcon className={compact ? "h-9 w-10 text-teal" : "h-10 w-11 text-teal"} />
      <span className="flex flex-col leading-none">
        <span className={`${compact ? "text-[15px]" : "text-base"} font-bold tracking-[0.22em]`}>FLOWVIA</span>
        <span className={`${compact ? "mt-1 text-[9px]" : "mt-1.5 text-[10px]"} font-semibold tracking-[0.42em] text-teal`}>HEALTH</span>
      </span>
    </span>
  );
}

export function Logo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return <Link href="/" aria-label="Flowvia Health home" className="inline-flex shrink-0"><LogoLockup compact={compact} dark={dark} /></Link>;
}
