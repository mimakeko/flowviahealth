import { CalendarClock, ShieldCheck } from "lucide-react";
import type {
  SchedulingCard,
  SchedulingReadinessResult,
  SuggestedSchedulingWindow,
  TherapistFitResult,
  VisitConflictResult,
} from "@/lib/pilot/scheduling-intelligence";
import { SchedulingReadinessCard } from "@/components/scheduling-readiness-card";
import { SchedulingWindowList } from "@/components/scheduling-window-list";

type SchedulingIntelligencePanelProps = Readonly<{
  cards?: readonly SchedulingCard[];
  conflict?: VisitConflictResult;
  enableUseWindowAction?: boolean;
  fit?: TherapistFitResult | null;
  readiness?: SchedulingReadinessResult | null;
  summary?: string;
  title?: string;
  windows?: readonly SuggestedSchedulingWindow[];
}>;

function fitClassName(label: TherapistFitResult["label"]) {
  if (label === "best_fit") return "bg-emerald-50 text-emerald-900 ring-emerald-200";
  if (label === "good_fit") return "bg-blue-50 text-blue-900 ring-blue-200";
  if (label === "weak_fit") return "bg-amber-50 text-amber-950 ring-amber-200";
  return "bg-rose-50 text-rose-950 ring-rose-200";
}

export function SchedulingIntelligencePanel({
  cards = [],
  conflict,
  enableUseWindowAction = false,
  fit,
  readiness,
  summary = "Deterministic scheduling intelligence for fake pilot operations. Human review is required.",
  title = "Scheduling Intelligence",
  windows = [],
}: SchedulingIntelligencePanelProps) {
  const allCards = [...(readiness?.cards ?? []), ...(conflict?.cards ?? []), ...cards];

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-[0_10px_30px_rgba(10,37,64,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue">
            <CalendarClock size={18} />
            {title}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
          <ShieldCheck size={14} />
          Human review required
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        {readiness ? (
          <div className="rounded-lg border border-line bg-slate-50 p-3">
            <dt className="font-semibold text-ink">Readiness</dt>
            <dd className="mt-1 text-slate-600">{readiness.readiness.replaceAll("_", " ")}</dd>
          </div>
        ) : null}
        {fit ? (
          <div className={`rounded-lg px-3 py-3 ring-1 ${fitClassName(fit.label)}`}>
            <dt className="font-semibold">Therapist fit</dt>
            <dd className="mt-1">{fit.label.replaceAll("_", " ")} · score {fit.score}</dd>
          </div>
        ) : null}
        {conflict ? (
          <div className="rounded-lg border border-line bg-slate-50 p-3">
            <dt className="font-semibold text-ink">Conflict level</dt>
            <dd className="mt-1 text-slate-600">{conflict.level}</dd>
          </div>
        ) : null}
      </dl>

      {fit ? (
        <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p className="font-semibold text-ink">{fit.reason}</p>
          <p className="mt-1">{fit.explanation}</p>
        </div>
      ) : null}

      {allCards.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {allCards.map((card) => <SchedulingReadinessCard key={`${card.label}-${card.nextAction}`} card={card} />)}
        </div>
      ) : null}

      {windows.length > 0 ? <div className="mt-4"><SchedulingWindowList enableUseWindowAction={enableUseWindowAction} windows={windows} /></div> : null}

      <dl className="mt-4 grid gap-2 border-t border-line pt-4 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex justify-between gap-3"><dt>Source</dt><dd className="font-semibold text-ink">deterministic</dd></div>
        <div className="flex justify-between gap-3"><dt>External maps/geocoding</dt><dd className="font-semibold text-ink">Disabled</dd></div>
        <div className="flex justify-between gap-3"><dt>Travel-time APIs</dt><dd className="font-semibold text-ink">Disabled</dd></div>
        <div className="flex justify-between gap-3"><dt>External AI</dt><dd className="font-semibold text-ink">Disabled</dd></div>
        <div className="flex justify-between gap-3"><dt>Autonomous scheduling</dt><dd className="font-semibold text-ink">Disabled</dd></div>
        <div className="flex justify-between gap-3"><dt>No-PHI mode</dt><dd className="font-semibold text-ink">On</dd></div>
      </dl>
    </section>
  );
}
