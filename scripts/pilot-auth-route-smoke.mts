import { authenticatePilotCredentials, getSessionSecret } from "../lib/pilot/credentials.ts";
import { createPilotSessionCookieValue, PILOT_SESSION_COOKIE } from "../lib/pilot/session.ts";
import { loadLocalEnv } from "./load-local-env.mts";

type Expected = {
  label: string;
  locationIncludes?: string;
  status: number | number[];
};

loadLocalEnv();

const baseUrl = (process.env.FLOWVIA_AUTH_ROUTE_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminEmail = process.env.FLOWVIA_AUTH_SMOKE_EMAIL;
const adminPassword = process.env.FLOWVIA_AUTH_SMOKE_PASSWORD;
const therapistEmail = process.env.FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL;
const therapistPassword = process.env.FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD;

function requireValue(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for route auth smoke.`);
  return value;
}

async function expectResponse(path: string, expected: Expected, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  });
  const allowedStatuses = Array.isArray(expected.status) ? expected.status : [expected.status];
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${expected.label} expected HTTP ${allowedStatuses.join(" or ")} but got ${response.status}.`);
  }
  const location = response.headers.get("location") || "";
  if (expected.locationIncludes && !location.includes(expected.locationIncludes)) {
    throw new Error(`${expected.label} expected redirect location containing ${expected.locationIncludes} but got ${location || "no location"}.`);
  }
  return response;
}

function cookieHeader(value: string) {
  return `${PILOT_SESSION_COOKIE}=${value}`;
}

const adminAuth = await authenticatePilotCredentials({
  email: requireValue(adminEmail, "FLOWVIA_AUTH_SMOKE_EMAIL"),
  password: requireValue(adminPassword, "FLOWVIA_AUTH_SMOKE_PASSWORD"),
});

if (!adminAuth.ok || adminAuth.session.role !== "admin") {
  throw new Error("Admin smoke credentials did not authenticate as admin.");
}

const therapistAuth = await authenticatePilotCredentials({
  email: requireValue(therapistEmail, "FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL"),
  password: requireValue(therapistPassword, "FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD"),
});

if (!therapistAuth.ok || therapistAuth.session.role !== "therapist") {
  throw new Error("Therapist smoke credentials did not authenticate as therapist.");
}

const secret = getSessionSecret();
if (!secret) throw new Error("FLOWVIA_SESSION_SECRET is required for route auth smoke.");

await expectResponse("/", { label: "public home", status: 200 });
await expectResponse("/sms-consent", { label: "public sms consent", status: 200 });
await expectResponse("/api/telnyx/webhook", {
  label: "telnyx webhook not auth-blocked",
  status: [200, 400, 401],
}, {
  body: "{}",
  headers: { "content-type": "application/json" },
  method: "POST",
});
await expectResponse("/dashboard", { label: "unauthenticated dashboard", locationIncludes: "/login", status: 307 });

const adminLoginBody = new URLSearchParams({
  email: adminEmail || "",
  next: "/dashboard",
  password: adminPassword || "",
});
const adminLogin = await expectResponse("/api/pilot-auth/login", {
  label: "admin login route",
  locationIncludes: "/dashboard",
  status: 303,
}, {
  body: adminLoginBody,
  headers: { "content-type": "application/x-www-form-urlencoded" },
  method: "POST",
});
const adminLoginCookie = adminLogin.headers.get("set-cookie");
if (!adminLoginCookie?.includes(PILOT_SESSION_COOKIE)) {
  throw new Error("Admin login route did not set the pilot session cookie.");
}

const adminCookie = cookieHeader(createPilotSessionCookieValue(adminAuth.session, secret));
await expectResponse("/dashboard", { label: "admin dashboard", status: 200 }, { headers: { cookie: adminCookie } });
await expectResponse("/admin/referrals", { label: "admin referrals", status: 200 }, { headers: { cookie: adminCookie } });
await expectResponse("/admin/visits", { label: "admin visits", status: 200 }, { headers: { cookie: adminCookie } });

const therapistLoginBody = new URLSearchParams({
  email: therapistEmail || "",
  next: "/my-work",
  password: therapistPassword || "",
});
const therapistLogin = await expectResponse("/api/pilot-auth/login", {
  label: "therapist login route",
  locationIncludes: "/my-work",
  status: 303,
}, {
  body: therapistLoginBody,
  headers: { "content-type": "application/x-www-form-urlencoded" },
  method: "POST",
});
const therapistLoginCookie = therapistLogin.headers.get("set-cookie");
if (!therapistLoginCookie?.includes(PILOT_SESSION_COOKIE)) {
  throw new Error("Therapist login route did not set the pilot session cookie.");
}

const therapistCookie = cookieHeader(createPilotSessionCookieValue(therapistAuth.session, secret));
await expectResponse("/my-work", { label: "therapist my-work", status: 200 }, { headers: { cookie: therapistCookie } });
await expectResponse("/admin/referrals", { label: "therapist referrals blocked", locationIncludes: "/unauthorized", status: 307 }, { headers: { cookie: therapistCookie } });
await expectResponse("/admin/visits", { label: "therapist visits blocked", locationIncludes: "/unauthorized", status: 307 }, { headers: { cookie: therapistCookie } });
await expectResponse("/admin/messages", { label: "therapist messages blocked", locationIncludes: "/unauthorized", status: 307 }, { headers: { cookie: therapistCookie } });

console.log("Pilot auth route smoke passed: public routes, login route, admin access, admin visits, and therapist RBAC verified.");
