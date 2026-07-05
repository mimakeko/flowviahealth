import { NextRequest, NextResponse } from "next/server";
import {
  authenticatePilotCredentials,
  getSessionSecret,
  sanitizeInternalNextPath,
  writePilotAuthAudit,
} from "@/lib/pilot/auth";
import { createPilotSessionCookieValue, PILOT_SESSION_COOKIE, PILOT_SESSION_TTL_SECONDS } from "@/lib/pilot/session";

export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string, status = 303) {
  return NextResponse.redirect(new URL(path, request.url), { status });
}

function redirectToLogin(request: NextRequest, error: "invalid" | "setup", nextPath: string) {
  return redirectTo(request, `/login?error=${error}&next=${encodeURIComponent(nextPath)}`);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
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
    return redirectToLogin(request, result.reason, nextPath);
  }

  const secret = getSessionSecret();
  if (!secret) {
    return redirectToLogin(request, "setup", nextPath);
  }

  const response = redirectTo(request, nextPath);
  response.cookies.set({
    name: PILOT_SESSION_COOKIE,
    value: createPilotSessionCookieValue(result.session, secret),
    httpOnly: true,
    maxAge: PILOT_SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  await writePilotAuthAudit({
    action: "pilot_login_success",
    email: result.session.email,
    role: result.session.role,
    success: true,
  });

  return response;
}
