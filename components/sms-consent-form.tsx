"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const PHI_DISCLAIMER = "I understand this SMS consent request form is for communication preferences only and should not be used to submit protected health information, medical records, diagnoses, treatment details, or emergency requests.";
const SMS_DISCLOSURE_OPENING = "By checking this box, I expressly consent to enroll in Flowvia Health SMS Notifications";
const SMS_DISCLOSURE = "and receive transactional healthcare text messages from Flowvia Health, owned, developed, and operated by Onzeon Holdings LLC, related to appointment reminders, appointment confirmations, scheduling updates, therapist arrival notifications, care coordination, responses to scheduling questions, patient inquiries, and other healthcare service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not a condition of receiving healthcare services.";

export function SmsConsentForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("We could not submit your SMS consent request.");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("loading");
    setErrorMessage("We could not submit your SMS consent request.");

    const formData = new FormData(form);
    const mobileNumber = String(formData.get("mobileNumber") ?? "").trim();
    const smsOptIn = formData.get("smsOptIn") === "on";

    if (!mobileNumber || !smsOptIn) {
      setErrorMessage("To enroll in Flowvia Health SMS Notifications, enter your mobile phone number and check the SMS consent box. If you do not want SMS messages, leave the box unchecked and do not submit this enrollment request.");
      setStatus("error");
      return;
    }

    let response: Response;

    try {
      response = await fetch("/api/sms-consent", { method: "POST", body: formData });
    } catch {
      setStatus("error");
      return;
    }

    if (response.ok) {
      setStatus("success");
      form.reset();
      return;
    }

    setStatus("error");
  }

  if (status === "success") return (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
      <CheckCircle2 className="mb-4 text-emerald-600" size={28}/>
      <h2 className="text-xl font-semibold">Consent request received</h2>
      <p className="mt-2 leading-7">Thank you. Your SMS consent request has been received. Flowvia Health will send a confirmation text to verify participation before transactional healthcare SMS messages are enabled.</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-label="SMS consent form">
      <div><label htmlFor="full-name" className="text-sm font-semibold text-ink">Full Name</label><input className="field" id="full-name" name="fullName" type="text" autoComplete="name" required placeholder="Your full name" /></div>
      <div><label htmlFor="mobile-number" className="text-sm font-semibold text-ink">Mobile Phone Number</label><input className="field" id="mobile-number" name="mobileNumber" type="tel" inputMode="tel" autoComplete="tel" aria-describedby="mobile-number-help" placeholder="(555) 555-0123" /><p id="mobile-number-help" className="mt-2 text-xs leading-5 text-slate-500">Enter your mobile number only if you want to enroll in Flowvia Health transactional SMS notifications.</p></div>
      <div><label htmlFor="sms-email" className="text-sm font-semibold text-ink">Email <span className="font-normal text-slate-400">(optional)</span></label><input className="field" id="sms-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" /></div>
      <div className="rounded-xl border border-line bg-mist/70 p-4">
        <label htmlFor="sms-opt-in" className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
          <input id="sms-opt-in" name="smsOptIn" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue" />
          <span><strong className="font-semibold text-ink">{SMS_DISCLOSURE_OPENING}</strong> {SMS_DISCLOSURE} I agree to the <Link href="/terms" className="font-medium text-blue underline">Terms of Service</Link> and <Link href="/privacy" className="font-medium text-blue underline">Privacy Policy</Link>.</span>
        </label>
      </div>
      <div className="rounded-xl border border-line bg-mist/70 p-4">
        <label htmlFor="sms-phi-disclaimer" className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
          <input id="sms-phi-disclaimer" name="phiDisclaimer" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-blue" />
          <span>{PHI_DISCLAIMER}</span>
        </label>
      </div>
      {status === "error" ? <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900"><AlertCircle size={18}/>{errorMessage} Please email <a href="mailto:support@flowviahealth.com" className="underline">support@flowviahealth.com</a> for assistance.</p> : null}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={status === "loading"}>{status === "loading" ? "Sending…" : "Submit SMS Consent"}</button>
    </form>
  );
}
