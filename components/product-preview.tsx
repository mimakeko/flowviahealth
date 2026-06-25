import { Bell, CalendarDays, CheckCircle2, LayoutDashboard, MessageSquareText, UsersRound } from "lucide-react";
import { FlowviaMark } from "./logo";

const visits = [
  ["9:00 AM", "Olivia Johnson", "OT follow-up", "Completed", "success"],
  ["10:30 AM", "James Williams", "PT visit", "In progress", "amber"],
  ["12:00 PM", "Sophia Martinez", "PT visit", "Scheduled", "blue"],
  ["1:30 PM", "Ethan Brown", "Nursing visit", "Scheduled", "blue"],
];

const nav = [[LayoutDashboard, "Overview"], [CalendarDays, "Schedule"], [UsersRound, "Care team"], [MessageSquareText, "Messages"], [Bell, "Reminders"]] as const;

export function ProductPreview({ compact = false }: { compact?: boolean }) {
  return (
    <figure className="relative mx-auto w-full max-w-[760px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="flex h-10 items-center justify-between border-b border-line bg-white px-4">
          <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#FF6B61]"/><i className="h-2 w-2 rounded-full bg-[#F5B942]"/><i className="h-2 w-2 rounded-full bg-success"/></div>
          <span className="concept-label"><i className="h-1.5 w-1.5 rounded-full bg-teal"/>Concept Preview</span>
        </div>
        <div className={`flex bg-mist ${compact ? "min-h-[390px]" : "min-h-[475px]"}`}>
          <aside className="hidden w-[126px] shrink-0 bg-ink px-3 py-4 text-white sm:block">
            <FlowviaMark className="mb-6 h-8 w-8" />
            {nav.map(([Icon, label], index) => <div key={label} className={`mb-1 flex items-center gap-2 rounded-md px-2.5 py-2 text-[9px] ${index === 0 ? "bg-white/10 text-teal" : "text-white/60"}`}><Icon size={12}/>{label}</div>)}
          </aside>
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Today's visits", "32", "blue"], ["Completed", "18", "success"], ["In progress", "7", "amber"], ["Pending", "7", "rose"]].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-line bg-white p-2.5"><div className="flex items-center gap-1 text-[7px] text-slate-500"><i className={`h-1.5 w-1.5 rounded-full ${tone === "success" ? "bg-success" : tone === "amber" ? "bg-amber-400" : tone === "rose" ? "bg-rose-400" : "bg-blue"}`}/>{label}</div><strong className="mt-1 block text-lg text-ink">{value}</strong></div>)}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_148px]">
              <section className="rounded-xl border border-line bg-white p-3.5">
                <div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-semibold">Today&apos;s schedule</h3><span className="text-[8px] text-slate-400">May 20, 2026</span></div>
                {visits.map(([time, name, type, status, tone]) => <div key={time} className="grid grid-cols-[52px_1fr_auto] items-center border-t border-slate-100 py-3 text-[8px]"><span className="font-medium text-slate-500">{time}</span><span><b className="block text-ink">{name}</b><span className="text-slate-400">{type}</span></span><span className={`font-medium ${tone === "success" ? "text-emerald-600" : tone === "amber" ? "text-amber-500" : "text-blue"}`}>{status}</span></div>)}
              </section>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {[["SMS reminders", "48", "Messages queued"], ["Team tasks", "12", "Open tasks"], ["Unread", "5", "New messages"]].map(([title, value, note]) => <section key={title} className="rounded-xl border border-line bg-white p-3"><h3 className="text-[8px] font-medium text-slate-500">{title}</h3><strong className="mt-2 block text-xl text-ink">{value}</strong><span className="text-[7px] text-slate-400">{note}</span></section>)}
              </div>
            </div>
            {!compact ? <div className="mt-3 flex items-center justify-between rounded-xl border border-teal/20 bg-teal/5 p-3 text-[8px]"><span className="flex items-center gap-2 font-medium text-ink"><CheckCircle2 size={13} className="text-teal"/>Appointment reminder workflow is active</span><span className="text-teal">12 sent today</span></div> : null}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Concept Preview of the Flowvia Health scheduling dashboard.</figcaption>
    </figure>
  );
}
