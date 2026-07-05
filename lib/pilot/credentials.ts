import { normalizePilotEmail, parsePilotEmailList, type PilotRole, type PilotSession, verifyScryptPasswordHash } from "./session.ts";

export type PilotAuthResult =
  | { ok: true; session: Pick<PilotSession, "email" | "role"> }
  | { ok: false; reason: "invalid" | "setup" };

export function getSessionSecret() {
  const secret = process.env.FLOWVIA_SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : undefined;
}

export function getPilotAuthConfigStatus() {
  const missing: string[] = [];
  const therapistEmails = parsePilotEmailList(process.env.FLOWVIA_THERAPIST_EMAILS);

  if (!process.env.FLOWVIA_ADMIN_EMAIL?.trim()) missing.push("FLOWVIA_ADMIN_EMAIL");
  if (!process.env.FLOWVIA_ADMIN_PASSWORD_HASH?.trim()) missing.push("FLOWVIA_ADMIN_PASSWORD_HASH");
  if (therapistEmails.length === 0) missing.push("FLOWVIA_THERAPIST_EMAILS");
  if (!process.env.FLOWVIA_THERAPIST_PASSWORD_HASH?.trim()) missing.push("FLOWVIA_THERAPIST_PASSWORD_HASH");
  if (!getSessionSecret()) missing.push("FLOWVIA_SESSION_SECRET");

  return {
    configured: missing.length === 0,
    missing,
    therapistEmailsConfigured: therapistEmails.length,
  };
}

function getConfiguredRole(email: string): PilotRole | null {
  const normalizedEmail = normalizePilotEmail(email);
  const adminEmail = normalizePilotEmail(process.env.FLOWVIA_ADMIN_EMAIL || "");
  const therapistEmails = parsePilotEmailList(process.env.FLOWVIA_THERAPIST_EMAILS);

  if (adminEmail && normalizedEmail === adminEmail) return "admin";
  if (therapistEmails.includes(normalizedEmail)) return "therapist";
  return null;
}

function getPasswordHashForRole(role: PilotRole) {
  const hash = role === "admin" ? process.env.FLOWVIA_ADMIN_PASSWORD_HASH : process.env.FLOWVIA_THERAPIST_PASSWORD_HASH;
  return hash?.trim().replaceAll("\\$", "$");
}

export async function authenticatePilotCredentials(input: { email: string; password: string }): Promise<PilotAuthResult> {
  if (!getPilotAuthConfigStatus().configured) {
    return { ok: false, reason: "setup" };
  }

  const email = normalizePilotEmail(input.email);
  const role = getConfiguredRole(email);
  if (!role) return { ok: false, reason: "invalid" };

  const validPassword = verifyScryptPasswordHash(input.password, getPasswordHashForRole(role));
  if (!validPassword) return { ok: false, reason: "invalid" };

  return { ok: true, session: { email, role } };
}

export function sanitizeInternalNextPath(value: FormDataEntryValue | string | null | undefined) {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  if (path.startsWith("/login") || path.startsWith("/api/")) return "/dashboard";
  return path;
}
