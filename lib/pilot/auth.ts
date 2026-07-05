import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrismaClient } from "@/lib/db/prisma";
import { assertServerOnlyModule } from "@/lib/sms/server-only";
import {
  createPilotSessionCookieValue,
  normalizePilotEmail,
  PILOT_SESSION_COOKIE,
  PILOT_SESSION_TTL_SECONDS,
  type PilotRole,
  type PilotSession,
  verifyPilotSessionCookieValue,
} from "./session.ts";
export {
  authenticatePilotCredentials,
  getPilotAuthConfigStatus,
  getSessionSecret,
  sanitizeInternalNextPath,
  type PilotAuthResult,
} from "./credentials.ts";
import { getSessionSecret } from "./credentials.ts";

assertServerOnlyModule();

export async function getCurrentPilotSession() {
  const cookieStore = await cookies();
  const secret = getSessionSecret();
  const cookieValue = cookieStore.get(PILOT_SESSION_COOKIE)?.value;

  return verifyPilotSessionCookieValue(cookieValue, secret);
}

export async function setPilotSessionCookie(session: Pick<PilotSession, "email" | "role">) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("FLOWVIA_SESSION_SECRET is required to create a pilot session.");

  const cookieStore = await cookies();
  const value = createPilotSessionCookieValue(session, secret);

  cookieStore.set({
    name: PILOT_SESSION_COOKIE,
    value,
    httpOnly: true,
    maxAge: PILOT_SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearPilotSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: PILOT_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function requirePilotSession(allowedRoles: PilotRole[], nextPath = "/dashboard") {
  const session = await getCurrentPilotSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!allowedRoles.includes(session.role)) {
    redirect("/unauthorized");
  }

  return session;
}

export async function writePilotAuthAudit(input: {
  action: "pilot_login_attempt" | "pilot_login_success" | "pilot_logout";
  email?: string;
  reason?: string;
  role?: PilotRole;
  success: boolean;
}) {
  if (!process.env.DATABASE_URL) return;

  try {
    const prisma = getPrismaClient();
    await prisma.auditLog.create({
      data: {
        actorId: input.email ? normalizePilotEmail(input.email) : undefined,
        actorType: input.role === "therapist" ? "therapist_pilot" : "pilot_admin",
        action: input.action,
        entityType: "PilotAuth",
        metadataJson: {
          reason: input.reason || null,
          role: input.role || null,
          success: input.success,
        },
      },
    });
  } catch {
    // Auth audit should never block login/logout during pilot validation.
  }
}
