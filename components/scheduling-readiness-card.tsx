import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { SchedulingCard } from "@/lib/pilot/scheduling-intelligence";

function levelClassName(level: SchedulingCard["level"]) {
  if (level === "blocker") return "border-rose-200 bg-rose-50 text-rose-950";
  if (level === "caution") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-line bg-slate-50 text-slate-700";
}

function LevelIcon({ level }: { level: SchedulingCard["level"] }) {
  if (level === "blocker") return <ShieldAlert size={17} />;
  if (level === "caution") return <AlertTriangle size={17} />;
  return <Info size={17} />;
}

export function SchedulingReadinessCard({ card }: { card: SchedulingCard }) {
  return (
    <article className={`rounded-lg border p-4 ${levelClassName(card.level)}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0"><LevelIcon level={card.level} /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{card.label}</h3>
            <span className="inline-flex rounded-md bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 ring-1 ring-black/5">{card.level}</span>
          </div>
          <p className="mt-2 text-sm leading-6">{card.explanation}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink">{card.nextAction}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <CheckCircle2 size={13} />
            Source: deterministic
          </p>
        </div>
      </div>
    </article>
  );
}
