"use client";

import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import { useRef, useState } from "react";

type TherapistOption = { id: string; name: string };

type StagedReferralFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  therapists: TherapistOption[];
};

const steps = ["Who and where?", "What service?", "When and how often?", "Review"] as const;

export function StagedReferralForm({ action, therapists }: StagedReferralFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);

  const goForward = () => {
    if (step === 0 && !formRef.current?.reportValidity()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  return (
    <form action={action} ref={formRef} className="mt-6 max-w-3xl rounded-xl border border-line bg-white p-4 sm:p-6" data-testid="staged-referral-form">
      <div aria-label="Referral form progress" className="mb-6 grid grid-cols-4 gap-2">
        {steps.map((label, index) => (
          <div key={label} aria-current={index === step ? "step" : undefined} className="min-w-0">
            <div className={`h-1.5 rounded-full ${index <= step ? "bg-teal" : "bg-slate-200"}`} />
            <p className={`mt-2 text-xs font-semibold leading-4 ${index === step ? "text-ink" : "text-slate-500"}`}>{label}</p>
          </div>
        ))}
      </div>

      <div aria-live="polite" className="mb-5">
        <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">{steps[step]}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{step === 0 ? "Start with the information needed to route this referral." : step === 1 ? "Keep the service request short and operational." : step === 2 ? "Add safe workflow details. You can leave optional items empty." : "Review the entry, then create the referral."}</p>
      </div>

      <div className={`${step === 0 ? "grid" : "hidden"} gap-4 sm:grid-cols-2`}>
          <label className="text-sm font-semibold text-ink">Patient name<input className="field" name="patientName" required /></label>
          <label className="text-sm font-semibold text-ink">Phone<input className="field" name="phone" required inputMode="tel" /></label>
          <label className="text-sm font-semibold text-ink">Target city<input className="field" name="city" /></label>
          <label className="text-sm font-semibold text-ink">Target ZIP<input className="field" name="zip" inputMode="numeric" /></label>
          <label className="text-sm font-semibold text-ink sm:col-span-2">Email <span className="font-normal text-slate-400">(optional)</span><input className="field" name="email" type="email" /></label>
          <label className="text-sm font-semibold text-ink sm:col-span-2">Address <span className="font-normal text-slate-400">(optional, restricted)</span><input className="field" name="address" /></label>
      </div>

      <div className={`${step === 1 ? "grid" : "hidden"} gap-4`}>
          <label className="text-sm font-semibold text-ink">Service or discipline<input className="field" name="careType" placeholder="Example: PT mobility visits" /></label>
          <label className="text-sm font-semibold text-ink">Referral source <span className="font-normal text-slate-400">(optional)</span><input className="field" name="referralSource" /></label>
          <label className="text-sm font-semibold text-ink">Assigned therapist <span className="font-normal text-slate-400">(optional)</span><select className="field" name="assignedTherapistId" defaultValue=""><option value="">Choose later</option>{therapists.map((therapist) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
      </div>

      <div className={`${step === 2 ? "grid" : "hidden"} gap-4`}>
          <label className="text-sm font-semibold text-ink">Current status<select className="field" name="status" defaultValue="new"><option value="new">New</option><option value="contacted">Contacted</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></label>
          <label className="text-sm font-semibold text-ink">Operational note <span className="font-normal text-slate-400">(optional, no PHI)</span><textarea className="field min-h-28" name="notes" placeholder="Scheduling, access, assignment, or status only" /></label>
          <label className="text-sm font-semibold text-ink">Duplicate override reason <span className="font-normal text-slate-400">(only when needed)</span><textarea className="field min-h-24" name="duplicateOverrideReason" /></label>
      </div>

      <div className={step === 3 ? "rounded-xl bg-mist p-4 text-sm leading-6 text-slate-700" : "hidden"}>
          <p className="font-semibold text-ink">Ready for a manual referral review.</p>
          <p className="mt-2">Flowvia will keep the existing duplicate, intake readiness, no-PHI note, RBAC, and audit checks in place when you save.</p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-between">
        {step > 0 ? <button className="btn-secondary min-h-12" onClick={() => setStep((current) => current - 1)} type="button"><ArrowLeft aria-hidden="true" size={18} />Back</button> : <span />}
        {step < steps.length - 1 ? <button className="btn-primary min-h-12" onClick={goForward} type="button">Continue<ArrowRight aria-hidden="true" size={18} /></button> : <button className="btn-primary min-h-12" type="submit"><Save aria-hidden="true" size={18} />Create referral</button>}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-slate-500"><Check aria-hidden="true" className="text-teal" size={16} />No PHI or clinical detail in notes.</p>
    </form>
  );
}
