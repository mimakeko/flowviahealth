"use client";

import Link from "next/link";
import { FilePlus2, Plus, StickyNote } from "lucide-react";
import { useEffect, useRef } from "react";

type QuickCaptureLauncherProps = {
  role: "admin" | "therapist";
};

export function QuickCaptureLauncher({ role }: QuickCaptureLauncherProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isAdmin = role === "admin";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialogRef.current?.open) dialogRef.current.close();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label="Add or capture"
        className="fixed bottom-20 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal text-white shadow-[0_12px_28px_rgba(0,178,169,0.32)] transition hover:bg-[#009b94] focus:outline-none focus:ring-4 focus:ring-teal/25 motion-reduce:transition-none lg:hidden"
        data-testid="quick-capture-launcher"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        <Plus aria-hidden="true" size={26} />
      </button>

      <dialog ref={dialogRef} aria-labelledby="quick-capture-title" className="m-auto w-[min(100%-2rem,30rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/35">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="quick-capture-title" className="text-xl font-semibold tracking-[-.02em]">Add or capture</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Start only a safe workflow already supported in Flowvia.</p>
            </div>
            <button aria-label="Close add or capture" className="min-h-11 min-w-11 rounded-lg text-2xl text-slate-600 hover:bg-mist focus:outline-none focus:ring-4 focus:ring-blue/15" onClick={() => dialogRef.current?.close()} type="button">×</button>
          </div>

          <div className="mt-5 grid gap-3">
            {isAdmin ? (
              <Link href="/admin/referrals/new" onClick={() => dialogRef.current?.close()} className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-4 text-sm font-semibold text-ink transition hover:border-blue/40 hover:bg-ice focus:outline-none focus:ring-4 focus:ring-blue/15 motion-reduce:transition-none">
                <FilePlus2 aria-hidden="true" className="text-blue" size={20} />
                New referral
              </Link>
            ) : null}
            {isAdmin ? (
              <Link href="/admin/visits/new" onClick={() => dialogRef.current?.close()} className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-4 text-sm font-semibold text-ink transition hover:border-blue/40 hover:bg-ice focus:outline-none focus:ring-4 focus:ring-blue/15 motion-reduce:transition-none">
                <Plus aria-hidden="true" className="text-blue" size={20} />
                Add visit
              </Link>
            ) : null}
            <Link href={isAdmin ? "/admin/referrals/new" : "/my-work?view=schedule"} onClick={() => dialogRef.current?.close()} className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-4 text-sm font-semibold text-ink transition hover:border-blue/40 hover:bg-ice focus:outline-none focus:ring-4 focus:ring-blue/15 motion-reduce:transition-none">
              <StickyNote aria-hidden="true" className="text-blue" size={20} />
              {isAdmin ? "Add operational note" : "Find a visit to add a note"}
            </Link>
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">File upload and photo capture are not shown because this pilot does not yet support safe document handling in this workflow.</p>
        </div>
      </dialog>
    </>
  );
}
