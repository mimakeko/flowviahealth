import Link from "next/link";
import { BriefcaseMedical, CalendarDays, Home, Menu } from "lucide-react";

const items = [
  { href: "/my-work", icon: Home, label: "Home" },
  { href: "/my-work#opportunities", icon: BriefcaseMedical, label: "Opportunities" },
  { href: "/my-work#schedule", icon: CalendarDays, label: "Schedule" },
  { href: "/my-work#more", icon: Menu, label: "More" },
] as const;

export function MobileFieldNavigation() {
  return (
    <nav aria-label="Field navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(10,37,64,0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold text-slate-600 transition hover:bg-ice hover:text-blue focus:outline-none focus:ring-4 focus:ring-blue/15">
              <Icon aria-hidden="true" size={20} strokeWidth={2} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
