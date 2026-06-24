import type { Metadata } from "next";
import { Mail, ShieldAlert } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = { title: "Contact", description: "Contact Flowvia Health about healthcare workflow and patient communication technology.", alternates: { canonical: "/contact" }, openGraph: { title: "Contact Flowvia Health", url: "/contact" } };

export default function ContactPage() {
  return <section className="bg-mist py-16 sm:py-20"><div className="container-page grid gap-12 lg:grid-cols-[.85fr_1.15fr]"><div><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue text-white"><Mail size={23}/></span><h1 className="mt-6 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Let’s talk about better coordination.</h1><p className="body-lg mt-6">Use this form for product, partnership, and general business inquiries about Flowvia Health.</p><div className="mt-9 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><ShieldAlert className="mt-0.5 shrink-0" size={20}/><p className="text-sm leading-6">Do not submit protected health information, medical records, emergency requests, or sensitive medical details through this form.</p></div></div><div className="rounded-[24px] border border-line bg-white p-6 shadow-soft sm:p-9"><h2 className="text-2xl font-semibold tracking-[-.025em]">Contact Flowvia Health</h2><p className="mt-2 mb-8 text-sm leading-6 text-slate-500">This form is a non-functional product placeholder. It does not send or store information.</p><ContactForm /></div></div></section>;
}
