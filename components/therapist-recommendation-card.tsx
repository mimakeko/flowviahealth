import {
  therapistRecommendationClassName,
  therapistRecommendationDisplayLabel,
  type TherapistRecommendation,
} from "@/lib/pilot/therapist-recommendation";

export function TherapistRecommendationBadge({ recommendation }: { recommendation: TherapistRecommendation }) {
  return (
    <span
      data-therapist-recommendation={recommendation.fitLevel}
      className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${therapistRecommendationClassName(recommendation)}`}
    >
      {therapistRecommendationDisplayLabel(recommendation)}
    </span>
  );
}

export function TherapistRecommendationCard({ recommendation }: { recommendation: TherapistRecommendation }) {
  const primaryExplanation = recommendation.explanation[0] || "No positive service-area evidence is available.";

  return (
    <article data-therapist-recommendation={recommendation.fitLevel} className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{recommendation.therapistName}</p>
          <p className="mt-1 text-xs text-slate-500">Recommendation #{recommendation.stableOrder} · deterministic</p>
        </div>
        <TherapistRecommendationBadge recommendation={recommendation} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{primaryExplanation}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">Uncertainty: {recommendation.uncertainty.level}</p>
      <details className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">Why this recommendation</summary>
        <div className="mt-3 grid gap-3 text-slate-600">
          {recommendation.eligibility.reasons.length > 0 ? <p><span className="font-semibold text-ink">Not eligible:</span> {recommendation.eligibility.reasons.join("; ")}</p> : null}
          <ul className="grid gap-1">
            {recommendation.explanation.map((reason) => <li key={reason}>- {reason}</li>)}
          </ul>
          {recommendation.missingData.length > 0 ? <p><span className="font-semibold text-ink">Missing data:</span> {recommendation.missingData.join("; ")}</p> : null}
          <p><span className="font-semibold text-ink">Uncertainty:</span> {recommendation.uncertainty.reasons.join("; ")}</p>
          <p className="font-semibold text-amber-900">Human review required. This recommendation never assigns, offers, schedules, or sends a message.</p>
        </div>
      </details>
    </article>
  );
}
