import { loadLocalEnv } from "./load-local-env.mts";

type ExpectedResponse = {
  label: string;
  locationIncludes?: string;
  status: number | number[];
};

loadLocalEnv();

const baseUrl = (process.env.FLOWVIA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function expectResponse(path: string, expected: ExpectedResponse, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  });
  const allowedStatuses = Array.isArray(expected.status) ? expected.status : [expected.status];
  if (!allowedStatuses.includes(response.status)) {
    const body = await response.text().catch(() => "");
    throw new Error(`${expected.label} expected HTTP ${allowedStatuses.join(" or ")} but got ${response.status}. Response body length: ${body.length}.`);
  }

  const location = response.headers.get("location") || "";
  if (expected.locationIncludes && !location.includes(expected.locationIncludes)) {
    throw new Error(`${expected.label} expected redirect location containing ${expected.locationIncludes} but got ${location || "no location"}.`);
  }

  console.log(`PASS: ${expected.label} (${response.status})`);
  return response;
}

await expectResponse("/", { label: "public home", status: 200 });
await expectResponse("/sms-consent", { label: "public SMS consent", status: 200 });
await expectResponse("/dashboard", { label: "unauthenticated dashboard redirects to login", locationIncludes: "/login", status: [303, 307, 308] });
await expectResponse("/api/telnyx/webhook", {
  label: "Telnyx webhook rejects unsigned/invalid synthetic request without auth redirect",
  status: [400, 401],
}, {
  body: "not-json",
  headers: { "content-type": "application/json" },
  method: "POST",
});

console.log(`Cloud route smoke passed against ${baseUrl}.`);
