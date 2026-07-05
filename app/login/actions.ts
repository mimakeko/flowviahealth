"use server";

import { redirect } from "next/navigation";
import {
  authenticatePilotCredentials,
  sanitizeInternalNextPath,
  setPilotSessionCookie,
  writePilotAuthAudit,
} from "@/lib/pilot/auth";

function loginRedirect(error: "invalid" | "setup", nextPath: string): never {
  redirect(`/login?error=${error}&next=${encodeURIComponent(nextPath)}`);
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const nextPath = sanitizeInternalNextPath(formData.get("next"));

  const result = await authenticatePilotCredentials({ email, password });

  if (!result.ok) {
    await writePilotAuthAudit({
      action: "pilot_login_attempt",
      email,
      reason: result.reason,
      success: false,
    });
    return loginRedirect(result.reason, nextPath);
  }

  await setPilotSessionCookie(result.session);
  await writePilotAuthAudit({
    action: "pilot_login_success",
    email: result.session.email,
    role: result.session.role,
    success: true,
  });

  redirect(nextPath);
}
