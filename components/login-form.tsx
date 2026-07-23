"use client";

import { useEffect, useRef } from "react";
import { LogIn } from "lucide-react";

export function LoginForm({ configured, loggedOut, nextPath }: { configured: boolean; loggedOut: boolean; nextPath: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!loggedOut) return;

    const clearApplicationControlledCredentials = () => {
      const form = formRef.current;
      if (!form) return;
      form.reset();
      const email = form.elements.namedItem("email");
      const password = form.elements.namedItem("password");
      if (email instanceof HTMLInputElement) email.value = "";
      if (password instanceof HTMLInputElement) password.value = "";
    };

    clearApplicationControlledCredentials();
    const frame = window.requestAnimationFrame(clearApplicationControlledCredentials);
    window.addEventListener("pageshow", clearApplicationControlledCredentials);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", clearApplicationControlledCredentials);
    };
  }, [loggedOut]);

  return (
    <form ref={formRef} action="/api/pilot-auth/login" method="post" autoComplete="on" className="mt-7 grid gap-5">
      <input type="hidden" name="next" value={nextPath} />
      <label className="text-sm font-semibold text-ink">
        Email
        <input className="field" name="email" type="email" autoComplete="username" required disabled={!configured} />
      </label>
      <label className="text-sm font-semibold text-ink">
        Password
        <input className="field" name="password" type="password" autoComplete="current-password" required disabled={!configured} />
      </label>
      <button className="btn-primary w-full" type="submit" disabled={!configured}>
        <LogIn size={18} />
        Sign in
      </button>
    </form>
  );
}
