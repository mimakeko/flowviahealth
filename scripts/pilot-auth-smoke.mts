import {
  createPilotSessionCookieValue,
  createScryptPasswordHash,
  verifyPilotSessionCookieValue,
  verifyScryptPasswordHash,
} from "../lib/pilot/session.ts";
import { authenticatePilotCredentials } from "../lib/pilot/credentials.ts";
import { loadLocalEnv } from "./load-local-env.mts";

loadLocalEnv();

const secret = "flowvia-pilot-auth-smoke-secret-at-least-32-chars";
const adminPassword = "admin-auth-smoke-password";
const therapistPassword = "therapist-auth-smoke-password";
const adminHash = createScryptPasswordHash(adminPassword);
const therapistHash = createScryptPasswordHash(therapistPassword);

if (!verifyScryptPasswordHash(adminPassword, adminHash)) {
  throw new Error("Admin password hash did not verify.");
}

if (verifyScryptPasswordHash("wrong-password", adminHash)) {
  throw new Error("Invalid admin password unexpectedly verified.");
}

if (!verifyScryptPasswordHash(therapistPassword, therapistHash)) {
  throw new Error("Therapist password hash did not verify.");
}

const adminCookie = createPilotSessionCookieValue({ email: "Admin@FlowviaHealth.Test", role: "admin" }, secret);
const therapistCookie = createPilotSessionCookieValue({ email: "demo.north.dallas@flowviahealth.test", role: "therapist" }, secret);

const adminSession = verifyPilotSessionCookieValue(adminCookie, secret);
const therapistSession = verifyPilotSessionCookieValue(therapistCookie, secret);
const tamperedSession = verifyPilotSessionCookieValue(`${therapistCookie}x`, secret);

if (adminSession?.role !== "admin" || adminSession.email !== "admin@flowviahealth.test") {
  throw new Error("Admin session did not verify with the expected normalized role/email.");
}

if (therapistSession?.role !== "therapist" || therapistSession.email !== "demo.north.dallas@flowviahealth.test") {
  throw new Error("Therapist session did not verify with the expected role/email.");
}

if (tamperedSession) {
  throw new Error("Tampered session unexpectedly verified.");
}

if (process.env.FLOWVIA_AUTH_SMOKE_EMAIL || process.env.FLOWVIA_AUTH_SMOKE_PASSWORD) {
  const email = process.env.FLOWVIA_AUTH_SMOKE_EMAIL;
  const password = process.env.FLOWVIA_AUTH_SMOKE_PASSWORD;

  if (!email || !password) {
    throw new Error("Both FLOWVIA_AUTH_SMOKE_EMAIL and FLOWVIA_AUTH_SMOKE_PASSWORD are required for configured admin auth smoke.");
  }

  const result = await authenticatePilotCredentials({ email, password });
  if (!result.ok || result.session.role !== "admin") {
    throw new Error("Configured admin auth smoke failed.");
  }
}

if (process.env.FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL || process.env.FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD) {
  const email = process.env.FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL;
  const password = process.env.FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD;

  if (!email || !password) {
    throw new Error("Both FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL and FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD are required for configured therapist auth smoke.");
  }

  const result = await authenticatePilotCredentials({ email, password });
  if (!result.ok || result.session.role !== "therapist") {
    throw new Error("Configured therapist auth smoke failed.");
  }
}

console.log("Pilot auth smoke passed: scrypt hashes, configured credentials when provided, and signed role sessions verify.");
