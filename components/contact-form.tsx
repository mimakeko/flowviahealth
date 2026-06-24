"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  if (submitted) return <div role="status" className="rounded-2xl border border-blue/20 bg-blue/5 p-6"><CheckCircle2 className="mb-3 text-blue"/><h2 className="text-xl font-semibold">Thanks for reaching out.</h2><p className="mt-2 text-slate-600">This demonstration form is not connected to a backend, so no information was transmitted.</p></div>;
  return <form onSubmit={(event)=>{event.preventDefault();setSubmitted(true)}} className="space-y-5">
    <div><label htmlFor="contact-name" className="text-sm font-semibold">Name</label><input id="contact-name" name="name" className="field" autoComplete="name" required /></div>
    <div><label htmlFor="contact-email" className="text-sm font-semibold">Email</label><input id="contact-email" name="email" className="field" type="email" autoComplete="email" required /></div>
    <div><label htmlFor="contact-message" className="text-sm font-semibold">Message</label><textarea id="contact-message" name="message" className="field min-h-40 resize-y" required /></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Do not submit protected health information, medical records, emergency requests, or sensitive medical details through this form.</p>
    <button type="submit" className="btn-primary">Send Message</button>
  </form>;
}
