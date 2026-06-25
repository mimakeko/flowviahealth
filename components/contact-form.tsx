"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const PHI_ACKNOWLEDGEMENT = "I understand this form is for general inquiries only and should not be used to submit protected health information, medical records, diagnoses, treatment details, or emergency requests.";
const PHI_WARNING = "Do not submit protected health information, medical records, diagnoses, treatment details, emergency requests, or sensitive medical information through this form.";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const startedAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (startedAtRef.current) startedAtRef.current.value = String(Date.now());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

    const formData = new FormData(event.currentTarget);
    let response: Response;

    try {
      response = await fetch("/api/contact", { method: "POST", body: formData });
    } catch {
      setStatus("error");
      return;
    }

    if (response.ok) {
      setStatus("success");
      event.currentTarget.reset();
      return;
    }

    setStatus("error");
  }

  if (status === "success") {
    return <div role="status" className="rounded-2xl border border-blue/20 bg-blue/5 p-6"><CheckCircle2 className="mb-3 text-blue"/><h2 className="text-xl font-semibold">Thank you. Your message has been sent to Flowvia Health.</h2></div>;
  }

  return <form onSubmit={handleSubmit} className="space-y-5">
    <input ref={startedAtRef} type="hidden" name="startedAt" />
    <div className="hidden" aria-hidden="true"><label htmlFor="company-website">Company website</label><input id="company-website" name="companyWebsite" tabIndex={-1} autoComplete="off" /></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{PHI_WARNING}</p>
    <div><label htmlFor="contact-name" className="text-sm font-semibold">Name</label><input id="contact-name" name="name" className="field" autoComplete="name" required /></div>
    <div><label htmlFor="contact-email" className="text-sm font-semibold">Email</label><input id="contact-email" name="email" className="field" type="email" autoComplete="email" required /></div>
    <div><label htmlFor="contact-phone" className="text-sm font-semibold">Phone <span className="font-normal text-slate-400">(optional)</span></label><input id="contact-phone" name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" /></div>
    <div><label htmlFor="contact-organization" className="text-sm font-semibold">Organization <span className="font-normal text-slate-400">(optional)</span></label><input id="contact-organization" name="organization" className="field" autoComplete="organization" /></div>
    <div><label htmlFor="contact-message" className="text-sm font-semibold">Message</label><textarea id="contact-message" name="message" className="field min-h-40 resize-y" required /></div>
    <label htmlFor="phi-acknowledgement" className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-mist/70 p-4 text-sm leading-6 text-slate-700">
      <input id="phi-acknowledgement" name="phiAcknowledgement" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-blue" />
      <span>{PHI_ACKNOWLEDGEMENT}</span>
    </label>
    {status === "error" ? <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900"><AlertCircle size={18}/>We could not send your message. Please email <a href="mailto:support@flowviahealth.com" className="underline">support@flowviahealth.com</a>.</p> : null}
    <button type="submit" className="btn-primary" disabled={status === "loading"}>{status === "loading" ? "Sending…" : "Send Message"}</button>
  </form>;
}
