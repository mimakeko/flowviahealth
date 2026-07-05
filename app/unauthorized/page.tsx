import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { LogoLockup } from "@/components/logo";

export const metadata: Metadata = {
  title: "Unauthorized",
  robots: { index: false, follow: false },
};

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-mist px-5 py-10 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl flex-col justify-center">
        <LogoLockup />
        <section className="mt-10 rounded-lg border border-line bg-white p-8 shadow-[0_18px_45px_rgba(10,37,64,0.08)]">
          <LockKeyhole className="text-blue" size={30} />
          <h1 className="mt-5 text-3xl font-semibold tracking-[-.03em]">This role cannot access that workspace.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Admin routes are limited to pilot admins. Therapist users can use the dashboard and My Work during the field pilot.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
            <Link href="/login" className="btn-secondary">Switch user</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
