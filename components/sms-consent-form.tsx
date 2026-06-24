"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function SmsConsentForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
      <CheckCircle2 className="mb-4 text-emerald-600" size={28}/>
      <h2 className="text-xl font-semibold">Consent form submitted</h2>
      <p className="mt-2 leading-7">Thank you. You will receive a confirmation text. Reply YES to confirm your SMS consent.</p>
      <p className="mt-4 text-sm text-emerald-800">This demonstration form does not transmit or store your information.</p>
    </div>
  );

  return (
    <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }} className="space-y-6" aria-label="SMS consent form">
      <div><label htmlFor="full-name" className="text-sm font-semibold text-ink">Full Name</label><input className="field" id="full-name" name="fullName" autoComplete="name" required placeholder="Your full name" /></div>
      <div><label htmlFor="mobile-number" className="text-sm font-semibold text-ink">Mobile Phone Number</label><input className="field" id="mobile-number" name="mobileNumber" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(555) 555-0123" /></div>
      <div className="rounded-xl border border-line bg-mist/70 p-4">
        <label htmlFor="sms-opt-in" className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
          <input id="sms-opt-in" name="smsOptIn" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-blue" />
          <span>I agree to receive SMS messages from Flowvia Health regarding appointment reminders, scheduling updates, care coordination, patient communication, and related service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. I agree to the <Link href="/terms" className="font-medium text-blue underline">Terms of Service</Link> and <Link href="/privacy" className="font-medium text-blue underline">Privacy Policy</Link>.</span>
        </label>
      </div>
      <button type="submit" className="btn-primary w-full sm:w-auto">Submit SMS Consent</button>
    </form>
  );
}
