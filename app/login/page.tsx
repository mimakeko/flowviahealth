import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn, ShieldAlert } from "lucide-react";
import { LogoLockup } from "@/components/logo";
import { getCurrentPilotSession, getPilotAuthConfigStatus, sanitizeInternalNextPath } from "@/lib/pilot/auth";

export const metadata: Metadata = {
  title: "Pilot Login",
  robots: { index: false, follow: false },
};

const errorMessages = {
  invalid: "Those pilot credentials were not accepted.",
  setup: "Pilot auth is not fully configured yet.",
} as const;

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; logged_out?: string; next?: string }> }) {
  const params = await searchParams;
  const nextPath = sanitizeInternalNextPath(params?.next);
  const session = await getCurrentPilotSession();
  const config = getPilotAuthConfigStatus();
  const error = params?.error === "invalid" || params?.error === "setup" ? params.error : undefined;

  if (session && !params?.logged_out) {
    redirect(nextPath);
  }

  return (
    <main className="min-h-screen bg-mist px-5 py-10 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <section>
          <LogoLockup />
          <p className="eyebrow mt-10">Pilot access</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-.035em] sm:text-5xl">Sign in to Flowvia operations.</h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600">
            This is a minimal signed-cookie gate for the field pilot. It is not final enterprise authentication, and real PHI remains blocked until the remaining security policies are complete.
          </p>
          <Link href="/" className="mt-8 inline-flex text-sm font-semibold text-blue underline">Return to public site</Link>
        </section>

        <section className="rounded-lg border border-line bg-white p-6 shadow-[0_18px_45px_rgba(10,37,64,0.08)] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ice text-blue"><LogIn size={20} /></span>
            <div>
              <h2 className="text-xl font-semibold tracking-[-.02em]">Pilot login</h2>
              <p className="mt-1 text-xs text-slate-500">Admin and therapist roles are configured by environment variables.</p>
            </div>
          </div>

          {params?.logged_out ? (
            <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Signed out.</p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
              {errorMessages[error]}
            </p>
          ) : null}

          {!config.configured ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} />Auth setup required</div>
              <p className="mt-2">Missing env vars: {config.missing.join(", ")}.</p>
            </div>
          ) : null}

          <form action="/api/pilot-auth/login" method="post" className="mt-7 grid gap-5">
            <input type="hidden" name="next" value={nextPath} />
            <label className="text-sm font-semibold text-ink">
              Email
              <input className="field" name="email" type="email" autoComplete="username" required disabled={!config.configured} />
            </label>
            <label className="text-sm font-semibold text-ink">
              Password
              <input className="field" name="password" type="password" autoComplete="current-password" required disabled={!config.configured} />
            </label>
            <button className="btn-primary w-full" type="submit" disabled={!config.configured}>
              <LogIn size={18} />
              Sign in
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
