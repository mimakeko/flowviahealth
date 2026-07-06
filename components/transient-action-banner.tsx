"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TransientActionBannerProps = Readonly<{
  message: string;
  tone: "error" | "success";
}>;

const TRANSIENT_PARAMS = new Set(["error", "noteCategory", "noteDestination", "noteSuggestion", "success"]);

export function TransientActionBanner({ message, tone }: TransientActionBannerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    let changed = false;

    for (const key of TRANSIENT_PARAMS) {
      if (nextParams.has(key)) {
        nextParams.delete(key);
        changed = true;
      }
    }

    if (!changed) return;

    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  if (tone === "error") {
    return (
      <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
        {message}
      </p>
    );
  }

  return (
    <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">
      {message}
    </p>
  );
}
