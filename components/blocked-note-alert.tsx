import {
  NOTE_PILOT_FIELD_REMINDER,
  SECURE_CLINICAL_NOTES_DISABLED_MESSAGE,
  describeNoteDestinationHint,
  describeNoteMatchedCategory,
} from "@/lib/compliance/note-classification";

type SearchParamValue = string | string[] | undefined;

type BlockedNoteAlertProps = Readonly<{
  className?: string;
  searchParams?: {
    error?: SearchParamValue;
    noteCategory?: SearchParamValue;
    noteDestination?: SearchParamValue;
    noteSuggestion?: SearchParamValue;
  };
}>;

function firstParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function BlockedNoteAlert({ className = "mt-6", searchParams }: BlockedNoteAlertProps) {
  if (firstParam(searchParams?.error) !== "blocked_note") return null;

  const category = firstParam(searchParams?.noteCategory);
  const destination = firstParam(searchParams?.noteDestination);
  const suggestion = firstParam(searchParams?.noteSuggestion);

  return (
    <div role="alert" className={`${className} rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-950`}>
      <p className="font-semibold">Operational note blocked.</p>
      <dl className="mt-3 grid gap-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-800">Reason category</dt>
          <dd className="mt-1 font-semibold">{describeNoteMatchedCategory(category)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-800">Destination</dt>
          <dd className="mt-1">{describeNoteDestinationHint(destination)}</dd>
        </div>
        {suggestion ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-800">Suggested operational rewrite — review before saving</dt>
            <dd className="mt-1 rounded-md bg-white/75 px-3 py-2 text-rose-950">{suggestion}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 font-semibold">{NOTE_PILOT_FIELD_REMINDER}</p>
      <p className="mt-1 text-xs text-rose-900">{SECURE_CLINICAL_NOTES_DISABLED_MESSAGE}</p>
    </div>
  );
}
