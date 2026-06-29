import type { Metadata } from "next";
import { Mail, ShieldAlert } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = { title: "Contact", description: "Contact Flowvia Health, a healthcare workflow, scheduling, care coordination, and transactional healthcare messaging platform owned, developed, and operated by Onzeon Holdings LLC.", alternates: { canonical: "/contact" }, openGraph: { title: "Contact Flowvia Health", url: "/contact" } };

const contactEmails = [
  ["General inquiries", "hello@flowviahealth.com"],
  ["Support", "support@flowviahealth.com"],
  ["Privacy", "privacy@flowviahealth.com"],
] as const;

export default function ContactPage() {
  return <section className="bg-mist py-16 sm:py-20"><div className="container-page grid gap-12 lg:grid-cols-[.85fr_1.15fr]"><div><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue text-white"><Mail size={23}/></span><h1 className="mt-6 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Let’s talk about better coordination.</h1><p className="body-lg mt-6">Use this form for product, partnership, and general business inquiries about Flowvia Health. Flowvia Health is owned, developed, and operated by <a href="https://www.onzeonholdings.com" className="font-semibold text-blue underline">Onzeon Holdings LLC</a>.</p><div className="mt-8 space-y-3 rounded-2xl border border-line bg-white p-5 shadow-panel"><h2 className="text-sm font-semibold uppercase tracking-[.16em] text-slate-400">Contact options</h2><div className="grid gap-3 text-sm">{contactEmails.map(([label,email])=><p key={email} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="font-medium text-ink">{label}</span><a href={`mailto:${email}`} className="text-blue underline">{email}</a></p>)}</div></div><div className="mt-6 rounded-2xl border border-line bg-white p-5 text-sm leading-6 text-slate-700"><p><span className="font-semibold text-ink">Operator:</span> Onzeon Holdings LLC</p><p className="mt-2"><span className="font-semibold text-ink">Parent company:</span> <a href="https://www.onzeonholdings.com" className="font-semibold text-blue underline">www.onzeonholdings.com</a></p></div><div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><ShieldAlert className="mt-0.5 shrink-0" size={20}/><p className="text-sm leading-6">Do not submit protected health information, medical records, diagnoses, treatment details, emergency requests, or sensitive medical information through this form.</p></div></div><div className="rounded-[24px] border border-line bg-white p-6 shadow-soft sm:p-9"><h2 className="text-2xl font-semibold tracking-[-.025em]">Contact Flowvia Health</h2><p className="mt-2 mb-8 text-sm leading-6 text-slate-500">Messages are sent to Flowvia Health support for review. Do not include protected health information.</p><ContactForm /></div></div></section>;
}
