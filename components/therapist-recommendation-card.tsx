import {
  therapistRecommendationClassName,
  therapistRecommendationDisplayLabel,
  type TherapistRecommendation,
} from "@/lib/pilot/therapist-recommendation";

export function TherapistRecommendationBadge({ recommendation }: { recommendation: TherapistRecommendation }) {
  return (
    <span
      data-therapist-recommendation={recommendation.fitLevel}
      data-testid="therapist-recommendation-fit"
      className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${therapistRecommendationClassName(recommendation)}`}
    >
      {therapistRecommendationDisplayLabel(recommendation)}
    </span>
  );
}

export function TherapistRecommendationCard({ recommendation }: { recommendation: TherapistRecommendation }) {
  const primaryExplanation = recommendation.explanation[0] || "No positive service-area evidence is available.";
  const supportingReasons = recommendation.explanation.slice(1);
  const hasHiddenDetails = recommendation.eligibility.reasons.length > 0 || supportingReasons.length > 0 || recommendation.missingData.length > 0 || recommendation.uncertainty.reasons.length > 0;

  return (
    <article data-testid="therapist-recommendation-card" data-therapist-recommendation={recommendation.fitLevel} className="min-w-0 rounded-lg border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <p data-testid="therapist-recommendation-name" className="text-base font-semibold text-ink">{recommendation.therapistName}</p>
          <p data-testid="therapist-recommendation-reason" className="mt-2 text-sm leading-6 text-slate-700">{primaryExplanation}</p>
        </div>
        <TherapistRecommendationBadge recommendation={recommendation} />
      </div>
      {hasHiddenDetails ? (
        <details className="mt-4 rounded-lg border border-line bg-slate-50">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span>Why this fits</span>
            <span className="text-xs font-semibold text-blue">Details</span>
          </summary>
          <div className="grid gap-3 border-t border-line p-4 text-sm leading-6 text-slate-600">
            {recommendation.eligibility.reasons.length > 0 ? (
              <p>
                <span className="font-semibold text-ink">Needs review:</span> {recommendation.eligibility.reasons.join("; ")}
              </p>
            ) : null}
            {supportingReasons.length > 0 ? (
              <div className="grid gap-1">
                <p className="font-semibold text-ink">Supporting reasons</p>
                <ul className="grid gap-1">
                  {supportingReasons.map((reason) => <li key={reason}>- {reason}</li>)}
                </ul>
              </div>
            ) : null}
            {recommendation.missingData.length > 0 ? (
              <p>
                <span className="font-semibold text-ink">Missing information:</span> {recommendation.missingData.join("; ")}
              </p>
            ) : null}
            {recommendation.uncertainty.reasons.length > 0 ? (
              <p>
                <span className="font-semibold text-ink">Unknowns:</span> {recommendation.uncertainty.reasons.join("; ")}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}
