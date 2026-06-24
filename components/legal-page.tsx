import type { ReactNode } from "react";

export function LegalPage({ title, intro, children, lastUpdated = "June 24, 2026", effectiveDate }: { title: string; intro: string; children: ReactNode; lastUpdated?: string; effectiveDate?: string }) {
  return (
    <>
      <section className="border-b border-line bg-mist">
        <div className="container-page py-16 sm:py-20">
          <p className="eyebrow mb-4">Flowvia Health</p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">{intro}</p>
          <p className="mt-5 text-xs font-medium uppercase tracking-widest text-slate-400">{effectiveDate ? `Effective Date: ${effectiveDate}` : `Last updated ${lastUpdated}`}</p>
        </div>
      </section>
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1fr_280px] lg:py-20">
        <article className="legal-copy max-w-3xl space-y-10">{children}</article>
        <aside className="h-fit rounded-2xl border border-line bg-white p-6 shadow-panel lg:sticky lg:top-24">
          <p className="text-sm font-semibold text-ink">Important notice</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">This public website does not collect protected health information. Do not submit medical records, emergency requests, or sensitive medical details.</p>
          <p className="mt-4 text-sm leading-6 text-slate-600">If you are experiencing a medical emergency, call 911.</p>
        </aside>
      </div>
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="text-2xl font-semibold tracking-[-0.025em] text-ink">{title}</h2><div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-600">{children}</div></section>;
}
