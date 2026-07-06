export default function MyWorkLoading() {
  return (
    <div>
      <div className="border-b border-line pb-8">
        <p className="eyebrow">Pilot therapist</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">My work</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Loading the field workspace.</p>
      </div>

      <div className="mt-8 grid min-w-0 gap-5" aria-busy="true">
        <section className="rounded-lg border border-line bg-white p-5">
          <div className="h-5 w-48 rounded bg-slate-100" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="h-20 rounded-lg bg-slate-100" />
            <div className="h-20 rounded-lg bg-slate-100" />
            <div className="h-20 rounded-lg bg-slate-100" />
          </div>
        </section>
        <section className="rounded-lg border border-line bg-white p-5">
          <div className="h-5 w-32 rounded bg-slate-100" />
          <div className="mt-4 h-32 rounded-lg bg-slate-100" />
        </section>
      </div>
    </div>
  );
}
