import { referralWorkflowToneClassName, type ReferralWorkflowState } from "@/lib/pilot/referral-workflow-state";

export function ReferralWorkflowStatus({ compact = false, state }: { compact?: boolean; state: ReferralWorkflowState }) {
  if (compact) {
    return (
      <div data-referral-workflow-stage={state.stage}>
        <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${referralWorkflowToneClassName(state.tone)}`}>
          {state.label}
        </span>
        <p className="mt-1 text-xs text-slate-500">Next: {state.nextAction}</p>
      </div>
    );
  }

  return (
    <section data-referral-workflow-stage={state.stage} className={`rounded-lg p-4 ring-1 ${referralWorkflowToneClassName(state.tone)}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">Current workflow state</p>
      <h2 className="mt-2 text-xl font-semibold tracking-[-.02em]">{state.label}</h2>
      <p className="mt-2 text-sm leading-6">{state.detail}</p>
      <p className="mt-3 rounded-md bg-white/70 p-3 text-sm font-semibold">Next: {state.nextAction}</p>
    </section>
  );
}
