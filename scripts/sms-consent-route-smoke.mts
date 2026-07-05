import { loadLocalEnv } from "./load-local-env.mts";

type Expected = {
  label: string;
  status: number;
};

loadLocalEnv();

const baseUrl = (process.env.FLOWVIA_SMS_CONSENT_ROUTE_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const uniqueSuffix = Date.now().toString().slice(-6);

async function postConsent(input: {
  email?: string;
  fullName?: string;
  mobileNumber?: string;
  phiDisclaimer?: boolean;
  smsOptIn?: boolean;
}, expected: Expected) {
  const formData = new FormData();
  formData.set("fullName", input.fullName ?? `SMS Smoke ${uniqueSuffix}`);
  formData.set("mobileNumber", input.mobileNumber ?? `+1555${uniqueSuffix.padStart(7, "0").slice(0, 7)}`);
  if (input.email !== undefined) formData.set("email", input.email);
  if (input.smsOptIn ?? true) formData.set("smsOptIn", "on");
  if (input.phiDisclaimer ?? true) formData.set("phiDisclaimer", "on");

  const response = await fetch(`${baseUrl}/api/sms-consent`, {
    body: formData,
    method: "POST",
    redirect: "manual",
  });

  if (response.status !== expected.status) {
    const body = await response.text().catch(() => "");
    throw new Error(`${expected.label} expected HTTP ${expected.status} but got ${response.status}. Response body length: ${body.length}.`);
  }

  return response;
}

await postConsent(
  {
    email: "",
    mobileNumber: `+15550${uniqueSuffix.slice(-5)}`,
  },
  { label: "blank email consent", status: 200 },
);

await postConsent(
  {
    email: `sms-smoke-${uniqueSuffix}@example.test`,
    mobileNumber: `+15551${uniqueSuffix.slice(-5)}`,
  },
  { label: "provided email consent", status: 200 },
);

await postConsent(
  {
    mobileNumber: `+15552${uniqueSuffix.slice(-5)}`,
    smsOptIn: false,
  },
  { label: "unchecked consent", status: 400 },
);

console.log("SMS consent route smoke passed: missing email service does not block valid consent, and unchecked consent is rejected.");
