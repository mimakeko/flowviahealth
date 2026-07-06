"use client";

import { CircleAlert } from "lucide-react";
import { getSafeWorkspaceLoadErrorMessage } from "@/lib/pilot/therapist-workspace";

export default function MyWorkError({ reset }: { reset: () => void }) {
  return (
    <div>
      <div className="border-b border-line pb-8">
        <p className="eyebrow">Pilot therapist</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">My work</h1>
      </div>

      <section role="alert" className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <CircleAlert className="mb-3" size={24} />
        <h2 className="text-lg font-semibold">Field workspace unavailable</h2>
        <p className="mt-2 text-sm leading-6">{getSafeWorkspaceLoadErrorMessage()}</p>
        <button className="btn-secondary mt-5" type="button" onClick={reset}>Try again</button>
      </section>
    </div>
  );
}
