import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { SmsConsentForm } from "@/components/sms-consent-form";

export const metadata: Metadata = {
  title: "SMS Consent",
  description: "Review Flowvia Health SMS disclosures and provide consent for appointment reminders, scheduling updates, and care coordination messages.",
  alternates: { canonical: "/sms-consent" },
  openGraph: { title: "Flowvia Health SMS Consent", url: "/sms-consent" },
};

const disclosures = ["Message frequency varies.", "Message and data rates may apply.", "Reply STOP to opt out.", "Reply HELP for assistance.", "Consent is not a condition of receiving healthcare services."];
const messageTypes = ["Appointment reminders", "Appointment confirmations", "Scheduling updates", "Therapist arrival notifications", "Care coordination", "Responses to scheduling questions", "Service notifications"];

export default function SmsConsentPage() {
  return (
    <section className="bg-mist py-14 sm:py-20">
      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue text-white"><MessageSquareText size={24}/></span>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-.04em] text-ink sm:text-5xl">Flowvia Health SMS Consent</h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">By providing your mobile phone number and checking the consent box below, you agree to enroll in transactional SMS text messages from Flowvia Health, a healthcare workflow, scheduling, care coordination, and transactional healthcare messaging platform owned, developed, and operated by Onzeon Holdings LLC.</p>
            <p className="mt-5 text-sm leading-6 text-slate-600">After submitting this consent form and completing the enrollment process, you may receive transactional SMS messages from Flowvia Health related to appointment reminders, appointment confirmations, scheduling updates, therapist arrival notifications, care coordination, patient inquiries, and other healthcare service notifications.</p>
            <ul className="mt-8 space-y-3">{disclosures.map(x=><li key={x} className="flex gap-3 text-sm leading-6 text-slate-700"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal"/>{x}</li>)}</ul>
            <p className="mt-7 rounded-xl border border-blue/15 bg-white p-4 text-sm font-medium leading-6 text-ink">Flowvia Health does not sell or share mobile numbers, SMS opt-in data, or consent information with third parties or affiliates for marketing or promotional purposes.</p>
            <p className="mt-6 text-sm leading-6 text-slate-500">Review our <Link href="/privacy" className="font-semibold text-blue underline">Privacy Policy</Link> and <Link href="/terms" className="font-semibold text-blue underline">Terms of Service</Link>. SMS help/support: <a href="mailto:support@flowviahealth.com" className="font-semibold text-blue underline">support@flowviahealth.com</a>. SMS privacy/consent questions: <a href="mailto:privacy@flowviahealth.com" className="font-semibold text-blue underline">privacy@flowviahealth.com</a>.</p>
          </div>
          <div className="rounded-[24px] border border-line bg-white p-6 shadow-soft sm:p-9">
            <div className="mb-8 border-b border-line pb-6"><p className="eyebrow">Opt in</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.025em]">Provide your consent</h2><p className="mt-2 text-sm leading-6 text-slate-500">To enroll in Flowvia Health transactional SMS notifications, provide your mobile phone number and check the consent box below. Email is optional. Submitting this form begins the enrollment process and does not immediately send SMS messages.</p></div>
            <SmsConsentForm />
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-panel sm:p-8 lg:col-span-2">
            <h2 className="text-2xl font-semibold tracking-[-.025em] text-ink">What messages you&apos;ll receive</h2>
            <p className="mt-4 text-[15px] leading-7 text-slate-600">After submitting this consent form and completing the enrollment process, you may receive transactional SMS messages from Flowvia Health related to:</p>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              {messageTypes.map((messageType) => <li key={messageType} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal"/>{messageType}</li>)}
            </ul>
            <div className="mt-6 rounded-xl bg-ice p-4 text-sm font-semibold leading-6 text-ink">
              <p>Flowvia Health sends transactional healthcare messages only.</p>
              <p className="mt-2">Flowvia Health does not use this SMS program for advertising or promotional marketing.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-6 shadow-panel sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-.025em] text-ink">SMS Confirmation Process</h2>
            <p className="mt-4 text-[15px] leading-7 text-slate-600">Submitting this form does not instantly send an SMS. After your consent request is submitted and the enrollment process is completed, Flowvia Health may send a confirmation text message to verify that you wish to receive transactional healthcare SMS communications.</p>
            <p className="mt-5 text-sm font-semibold text-ink">Example confirmation message:</p>
            <blockquote className="mt-3 rounded-xl border-l-4 border-teal bg-mist p-5 text-sm leading-7 text-slate-700">&quot;Flowvia Health: Please reply YES to confirm you want to receive transactional healthcare SMS messages for appointment reminders, appointment confirmations, scheduling updates, therapist arrival notifications, care coordination, patient inquiries, and service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Terms: https://flowviahealth.com/terms Privacy: https://flowviahealth.com/privacy&quot;</blockquote>
            <p className="mt-5 rounded-xl bg-ice p-4 text-sm font-semibold leading-6 text-ink">SMS consent is not activated until the recipient confirms participation.</p>
          </section>

          <section className="rounded-2xl border border-line bg-white p-6 shadow-panel sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-.025em] text-ink">Program Information</h2>
            <dl className="mt-5 space-y-5 text-sm leading-6">
              <div><dt className="font-semibold text-ink">Program Name:</dt><dd className="mt-1 text-slate-600">Flowvia Health SMS Notifications</dd></div>
              <div><dt className="font-semibold text-ink">Program Purpose:</dt><dd className="mt-1 text-slate-600">Transactional healthcare messages for appointment reminders, appointment confirmations, scheduling updates, therapist arrival notifications, care coordination, responses to scheduling questions, and service notifications.</dd></div>
              <div><dt className="font-semibold text-ink">Message Frequency:</dt><dd className="mt-1 text-slate-600">Varies by patient needs.</dd></div>
              <div><dt className="font-semibold text-ink">Opt-Out:</dt><dd className="mt-1 text-slate-600">Reply STOP.</dd></div>
              <div><dt className="font-semibold text-ink">Help:</dt><dd className="mt-1 text-slate-600">Reply HELP.</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
