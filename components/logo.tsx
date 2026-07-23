import Link from "next/link";
import Image from "next/image";

export function FlowviaMark({ className = "h-10 w-auto" }: { className?: string }) {
  return <Image src="/brand/flowvia-mark.svg" alt="" aria-hidden="true" width={40} height={43} className={`shrink-0 ${className}`} />;
}

export function LogoLockup({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 ${dark ? "text-white" : "text-ink"}`}>
      <FlowviaMark className={compact ? "h-9 w-auto" : "h-10 w-auto"} />
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
