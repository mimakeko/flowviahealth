import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarCheck2, ChevronRight, GitBranch, MessagesSquare, ShieldCheck, UsersRound } from "lucide-react";
import { ProductPreview } from "@/components/product-preview";
import { ProductShowcase } from "@/components/product-showcase";
import { featureIcons, trustIcons } from "@/components/icons";
import { FlowviaMark, LogoLockup } from "@/components/logo";

export const metadata: Metadata = {
  title: "Smarter Care Coordination for Home Health Therapy",
  description: "Flowvia Health helps home health therapy teams coordinate scheduling, patient communication, appointment reminders, and care-team workflows.",
  alternates: { canonical: "/" },
  openGraph: { title: "Smarter care coordination for home health therapy", url: "/" },
};

const features = [
  ["Smart Scheduling", "Coordinate visit times, availability, and therapy workflows in one place.", featureIcons.scheduling],
  ["Appointment Reminders", "Keep visits top of mind with timely, consent-based reminders.", featureIcons.reminders],
  ["Patient SMS Notifications", "Share scheduling updates and service notifications by text.", featureIcons.sms],
  ["Care Team Coordination", "Keep clinicians, coordinators, and staff aligned on next steps.", featureIcons.team],
  ["Visit Workflow Tracking", "Follow visits from scheduled to confirmed and completed.", featureIcons.tracking],
  ["Future Secure Patient Portal", "A secure patient experience is planned for the future platform.", featureIcons.portal],
  ["Reporting & Analytics", "Turn workflow activity into clear, actionable operational insight.", featureIcons.reporting],
  ["HIPAA-Conscious Design", "Build privacy and security thinking into every product decision.", featureIcons.hipaa],
] as const;

const communication = [
  ["Appointment reminders", "Timely, consent-based reminders that help keep visits on track.", BellRing],
  ["Scheduling updates", "Clear communication when visit timing or availability changes.", CalendarCheck2],
  ["Care coordination", "Shared context that helps teams move work forward together.", UsersRound],
  ["Patient communication", "Purposeful service messages across the patient journey.", MessagesSquare],
  ["Workflow automation", "Repeatable triggers and follow-up steps for everyday coordination.", GitBranch],
  ["HIPAA-conscious design", "A product direction shaped by privacy, access, and accountability.", ShieldCheck],
] as const;

const compliance = [
  ["SMS consent workflows", "Clear, documented opt-in before service-related messages are sent."],
  ["Privacy-first communication", "Communication patterns designed around consent, purpose, and restraint."],
  ["No public website PHI collection", "This website is not a channel for medical records or sensitive health details."],
  ["Future secure infrastructure", "A roadmap that prioritizes encryption, access controls, and resilience."],
  ["Audit-friendly workflows", "Future logs and consent records designed to support review and accountability."],
] as const;

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-white">
        <svg aria-hidden="true" className="route-line -right-24 top-28 h-[560px] w-[600px] opacity-40" viewBox="0 0 600 560"><path d="M40 490 C150 475 95 315 230 330 S315 430 390 290 S450 140 570 80" fill="none" stroke="#00B2A9" strokeWidth="2"/><circle cx="230" cy="330" r="7" fill="#1D4EDB"/><circle cx="390" cy="290" r="6" fill="#00B2A9"/><circle cx="570" cy="80" r="7" fill="#1D4EDB"/></svg>
        <div className="container-page grid items-center gap-14 py-14 sm:py-18 lg:grid-cols-[.78fr_1.22fr] lg:gap-12 lg:py-20">
          <div className="relative z-10">
            <div className="mb-8"><LogoLockup /></div>
            <h1 className="display-title max-w-[660px]">Smarter care coordination for <span className="text-teal">home health therapy.</span></h1>
            <p className="body-lg mt-7 max-w-xl">Flowvia Health helps healthcare teams coordinate scheduling, patient communication, appointment reminders, and care-team workflows through modern healthcare technology.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/sms-consent" className="btn-primary">View SMS Consent <ArrowRight size={16}/></Link><Link href="#product-previews" className="btn-secondary">See Platform Preview</Link></div>
            <div className="mt-8 flex items-center gap-3 text-sm text-slate-500"><FlowviaMark className="h-5 w-5"/><span>Smarter care coordination. Better outcomes.</span></div>
          </div>
          <div className="relative z-10"><ProductPreview compact /></div>
        </div>
      </section>

      <section className="border-b border-line bg-ice/55">
        <div className="container-page grid items-center gap-12 py-16 lg:grid-cols-[.65fr_1.35fr] lg:py-20">
          <div aria-hidden="true" className="relative mx-auto flex h-52 w-64 items-center justify-center"><FlowviaMark className="h-32 w-32 opacity-90"/><span className="absolute left-2 top-7 h-2 w-2 rounded-full bg-teal"/><span className="absolute bottom-8 right-3 h-3 w-3 rounded-full bg-blue"/><span className="absolute left-3 top-9 w-14 border-t border-dashed border-teal/50"/><span className="absolute bottom-9 right-5 w-14 border-t border-dashed border-blue/40"/></div>
          <div><p className="eyebrow">The coordination challenge</p><h2 className="section-title mt-4 max-w-3xl">Too much care-team time is lost between the visits.</h2><p className="body-lg mt-6 max-w-3xl">Home health therapy teams spend too much time coordinating schedules, confirming visits, following up with patients, and managing fragmented communication. Flowvia Health is being designed to simplify those workflows.</p></div>
        </div>
      </section>

      <section id="platform" className="section-space scroll-mt-24 bg-white">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center"><p className="eyebrow">Designed around the work</p><h2 className="section-title mt-4">A calmer way to keep care moving.</h2><p className="body-lg mt-5">One connected product vision for schedules, messages, visits, and care-team follow-through.</p></div>
          <div className="relative mt-14 grid gap-x-16 gap-y-4 md:grid-cols-2"><div aria-hidden="true" className="absolute bottom-8 left-1/2 top-8 hidden border-l border-dashed border-teal/40 md:block"/>{features.map(([title,copy,Icon])=><article key={title} className="group flex gap-4 border-b border-line py-6 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-mist text-blue transition group-hover:-translate-y-1 group-hover:border-teal/40 group-hover:text-teal"><Icon size={22} strokeWidth={1.7}/></span><div><h3 className="font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></div></article>)}</div>
        </div>
      </section>

      <section id="product-previews" className="section-space scroll-mt-24 border-y border-line bg-mist">
        <div className="container-page"><div className="max-w-3xl"><p className="eyebrow">Product experience</p><h2 className="section-title mt-4">The care day, connected end to end.</h2><p className="body-lg mt-5">Explore seven branded concept previews for the future Flowvia Health platform.</p></div><ProductShowcase/><p className="mt-5 text-center text-xs text-slate-400">Concept previews — product features are in development.</p></div>
      </section>

      <section className="section-space bg-ink text-white">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><FlowviaMark className="h-14 w-14"/><h2 className="mt-7 text-3xl font-semibold leading-tight tracking-[-.03em] sm:text-4xl">Built for Healthcare Communication</h2></div><p className="max-w-2xl text-lg leading-8 text-white/65">Focused communication tools for the operational moments that keep home health therapy moving.</p></div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{communication.map(([title,copy,Icon])=><article key={title} className="bg-ink p-7"><Icon className="text-teal" size={25} strokeWidth={1.7}/><h3 className="mt-6 font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-white/55">{copy}</p></article>)}</div>
        </div>
      </section>

      <section className="section-space border-b border-line bg-ice/55">
        <div className="container-page"><div className="mx-auto max-w-3xl text-center"><p className="eyebrow">Responsible by design</p><h2 className="section-title mt-4">Built for compliance and patient trust.</h2><p className="body-lg mt-5">The public site makes consent, privacy, and appropriate use easy to understand.</p></div><div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">{compliance.map(([title,copy],i)=>{const Icon=trustIcons[i];return <article key={title} className="bg-white p-6 lg:min-h-64"><Icon className="text-blue" size={25} strokeWidth={1.7}/><h3 className="mt-7 font-semibold leading-6">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p></article>})}</div><div className="mt-10 flex justify-center"><Link href="/hipaa" className="inline-flex items-center gap-2 text-sm font-semibold text-blue hover:underline">Read about HIPAA & Security <ChevronRight size={16}/></Link></div></div>
      </section>
    </>
  );
}
