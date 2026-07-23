export type TherapistFitLevel = "best_fit" | "good_fit" | "possible_fit" | "poor_fit" | "insufficient_information";
export type RecommendationUncertaintyLevel = "low" | "medium" | "high";

export type TherapistRecommendationCandidate = Readonly<{
  acceptedUnscheduledCount?: number;
  active: boolean;
  id: string;
  knownConflictCount?: number;
  name: string;
  openVisitCount: number;
  serviceAreaNotes?: string | null;
}>;

export type TherapistRecommendationContext = Readonly<{
  careType?: string | null;
  city?: string | null;
  hasOpenVisit?: boolean;
  intakeReadiness?: "ready" | "needs_review" | "blocked" | "unknown";
  referralStatus: string;
  reviewedWindowProvided?: boolean;
  zip?: string | null;
}>;

export type TherapistRecommendation = Readonly<{
  eligibility: Readonly<{
    eligible: boolean;
    reasons: readonly string[];
  }>;
  explanation: readonly string[];
  fitLabel: "Best Fit" | "Good Fit" | "Possible Fit" | "Poor Fit" | "Insufficient Information";
  fitLevel: TherapistFitLevel;
  missingData: readonly string[];
  score: number;
  stableOrder: number;
  therapistId: string;
  therapistName: string;
  uncertainty: Readonly<{
    level: RecommendationUncertaintyLevel;
    reasons: readonly string[];
  }>;
}>;

const FIT_LABELS: Record<TherapistFitLevel, TherapistRecommendation["fitLabel"]> = {
  best_fit: "Best Fit",
  good_fit: "Good Fit",
  insufficient_information: "Insufficient Information",
  poor_fit: "Poor Fit",
  possible_fit: "Possible Fit",
};

const STOP_WORDS = new Set(["and", "care", "health", "home", "service", "services", "the", "therapy"]);

function normalize(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedZip(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(0, 5);
}

function careTokens(value: string | null | undefined) {
  return normalize(value).split(" ").filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function fitLevel(score: number, hasEvidence: boolean): TherapistFitLevel {
  if (!hasEvidence) return "insufficient_information";
  if (score >= 75) return "best_fit";
  if (score >= 60) return "good_fit";
  if (score >= 40) return "possible_fit";
  return "poor_fit";
}

function fitRank(level: TherapistFitLevel) {
  if (level === "best_fit") return 5;
  if (level === "good_fit") return 4;
  if (level === "possible_fit") return 3;
  if (level === "poor_fit") return 2;
  return 1;
}

function workloadPoints(openVisitCount: number, acceptedUnscheduledCount: number) {
  const workload = openVisitCount + acceptedUnscheduledCount;
  if (workload <= 1) return 25;
  if (workload <= 3) return 18;
  if (workload <= 5) return 10;
  return 0;
}

function evaluateCandidate(
  context: TherapistRecommendationContext,
  candidate: TherapistRecommendationCandidate,
): Omit<TherapistRecommendation, "stableOrder"> {
  const eligibilityReasons: string[] = [];
  const explanation: string[] = [];
  const missingData: string[] = [];
  const uncertaintyReasons: string[] = [];
  const serviceArea = normalize(candidate.serviceAreaNotes);
  const city = normalize(context.city);
  const zip = normalizedZip(context.zip);
  const acceptedUnscheduledCount = candidate.acceptedUnscheduledCount ?? 0;
  const knownConflictCount = candidate.knownConflictCount ?? 0;

  if (!candidate.active) eligibilityReasons.push("Therapist is inactive");
  if (context.referralStatus === "completed" || context.referralStatus === "canceled") eligibilityReasons.push("Referral is terminal");
  if (context.hasOpenVisit) eligibilityReasons.push("Referral already has an open visit");
  if (context.intakeReadiness === "blocked") eligibilityReasons.push("Referral intake is blocked");
  if (context.reviewedWindowProvided && knownConflictCount > 0) eligibilityReasons.push("Known conflict in the reviewed scheduling window");

  let score = 0;
  let hasLocationOrCareEvidence = false;
  if (!city && !zip) missingData.push("Referral city and ZIP are not complete");
  if (!serviceArea) missingData.push("Therapist service-area notes are not recorded");

  if (city && serviceArea.includes(city)) {
    score += 50;
    hasLocationOrCareEvidence = true;
    explanation.push("City matches the recorded service area");
  } else if (zip && serviceArea.includes(zip)) {
    score += 50;
    hasLocationOrCareEvidence = true;
    explanation.push("ZIP matches the recorded service area");
  } else if (zip.length >= 3 && serviceArea.includes(zip.slice(0, 3))) {
    score += 35;
    hasLocationOrCareEvidence = true;
    explanation.push("ZIP prefix matches the recorded service area");
  } else if (city || zip) {
    explanation.push("No direct city or ZIP evidence appears in the recorded service area");
  }

  const matchingCareTokens = careTokens(context.careType).filter((token) => serviceArea.includes(token));
  if (matchingCareTokens.length > 0) {
    score += 10;
    hasLocationOrCareEvidence = true;
    explanation.push("Care type matches recorded therapist coverage notes");
  } else if (!normalize(context.careType)) {
    missingData.push("Referral care type is not recorded");
  }

  const capacityPoints = workloadPoints(candidate.openVisitCount, acceptedUnscheduledCount);
  score += capacityPoints;
  explanation.push(`${candidate.openVisitCount} open visit${candidate.openVisitCount === 1 ? "" : "s"} and ${acceptedUnscheduledCount} accepted-unscheduled opportunit${acceptedUnscheduledCount === 1 ? "y" : "ies"}`);

  if (context.reviewedWindowProvided && knownConflictCount === 0) {
    score += 15;
    explanation.push("No known conflict in the reviewed scheduling window");
  } else if (!context.reviewedWindowProvided) {
    uncertaintyReasons.push("No candidate visit window was supplied for conflict review");
  }
  uncertaintyReasons.push("Travel time and route conditions are not available");
  uncertaintyReasons.push("Structured therapist availability is not recorded");

  const eligible = eligibilityReasons.length === 0;
  const level = fitLevel(score, hasLocationOrCareEvidence);
  const uncertaintyLevel: RecommendationUncertaintyLevel = missingData.length >= 2 || !hasLocationOrCareEvidence ? "high" : uncertaintyReasons.length > 0 ? "medium" : "low";

  return {
    eligibility: { eligible, reasons: eligibilityReasons },
    explanation,
    fitLabel: FIT_LABELS[level],
    fitLevel: level,
    missingData,
    score: Math.max(0, Math.min(100, score)),
    therapistId: candidate.id,
    therapistName: candidate.name,
    uncertainty: { level: uncertaintyLevel, reasons: uncertaintyReasons },
  };
}

/** Pure deterministic ranking. No writes, external APIs, maps, travel time, or AI. */
export function recommendTherapists(
  context: TherapistRecommendationContext,
  candidates: readonly TherapistRecommendationCandidate[],
): TherapistRecommendation[] {
  return candidates
    .map((candidate) => evaluateCandidate(context, candidate))
    .sort((left, right) => {
      if (left.eligibility.eligible !== right.eligibility.eligible) return Number(right.eligibility.eligible) - Number(left.eligibility.eligible);
      const fitDifference = fitRank(right.fitLevel) - fitRank(left.fitLevel);
      if (fitDifference) return fitDifference;
      if (right.score !== left.score) return right.score - left.score;
      const nameDifference = left.therapistName.localeCompare(right.therapistName, "en", { sensitivity: "base" });
      return nameDifference || left.therapistId.localeCompare(right.therapistId);
    })
    .map((recommendation, index) => ({ ...recommendation, stableOrder: index + 1 }));
}

export function therapistRecommendationClassName(recommendation: Pick<TherapistRecommendation, "eligibility" | "fitLevel">) {
  if (!recommendation.eligibility.eligible) return "bg-rose-50 text-rose-900 ring-rose-200";
  if (recommendation.fitLevel === "best_fit") return "bg-emerald-50 text-emerald-900 ring-emerald-200";
  if (recommendation.fitLevel === "good_fit") return "bg-blue-50 text-blue-900 ring-blue-200";
  if (recommendation.fitLevel === "possible_fit") return "bg-amber-50 text-amber-950 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export function therapistRecommendationDisplayLabel(recommendation: Pick<TherapistRecommendation, "eligibility" | "fitLabel">) {
  return recommendation.eligibility.eligible ? recommendation.fitLabel : "Not Eligible";
}
