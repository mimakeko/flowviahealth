const baseUrl = "https://flowviahealth.com";

const checklist = [
  {
    title: "Public routes",
    items: [
      `${baseUrl}/`,
      `${baseUrl}/sms-consent`,
      `${baseUrl}/privacy`,
      `${baseUrl}/terms`,
      `${baseUrl}/hipaa`,
      `${baseUrl}/contact`,
    ],
  },
  {
    title: "Protected route redirects",
    items: [
      `${baseUrl}/dashboard -> unauthenticated redirect to /login`,
      `${baseUrl}/admin/referrals -> unauthenticated redirect to /login`,
      `${baseUrl}/admin/visits -> unauthenticated redirect to /login`,
      `${baseUrl}/admin/messages -> unauthenticated redirect to /login`,
      `${baseUrl}/my-work -> unauthenticated redirect to /login`,
    ],
  },
  {
    title: "Auth routes",
    items: [
      "Admin login succeeds with staging admin credentials.",
      "Therapist login succeeds with staging therapist credentials.",
      "Logout clears the pilot session cookie.",
    ],
  },
  {
    title: "RBAC",
    items: [
      "Admin can open dashboard, referrals, visits, Message Ledger, and My Work.",
      "Therapist can open dashboard and My Work.",
      "Therapist is redirected away from /admin/referrals, /admin/visits, and /admin/messages.",
    ],
  },
  {
    title: "Message Ledger",
    items: [
      `${baseUrl}/admin/messages`,
      "Storage shows Postgres.",
      "Telnyx API key shows configured without exposing value.",
      "Messaging profile shows configured.",
      "Webhook signing shows configured/enforced.",
      "Real SMS test shows off unless actively testing.",
      "Unsigned webhook bypass shows disabled.",
      "No full phone numbers or secrets are exposed.",
    ],
  },
  {
    title: "SMS consent dry run",
    items: [
      `${baseUrl}/sms-consent`,
      "Submit fake data only with personal/test phone boundary.",
      "Confirm missing email service does not block consent capture.",
      "Confirm no PHI is entered.",
    ],
  },
  {
    title: "Controlled personal SMS test",
    items: [
      "Temporarily set FLOWVIA_ALLOW_REAL_SMS_TEST=true in Vercel.",
      "Redeploy/restart if required.",
      "Submit /sms-consent with owner personal phone and fake data only.",
      "Confirm outbound confirmation SMS.",
    ],
  },
  {
    title: "Webhook replies",
    items: [
      `${baseUrl}/api/telnyx/webhook`,
      "Set Telnyx inbound webhook URL to the cloud endpoint with POST.",
      "Reply START or YES and confirm opt-in response.",
      "Reply HELP and confirm help response.",
      "Reply STOP and confirm opt-out response.",
      "Confirm Message Ledger consent state, webhook events, and audit trail.",
      "If duplicate responses happen, disable/clear Telnyx-side keyword auto replies.",
    ],
  },
  {
    title: "Turn real SMS off",
    items: [
      "Set FLOWVIA_ALLOW_REAL_SMS_TEST=false immediately after controlled testing.",
      "Redeploy/restart if required.",
      "Reopen Message Ledger and confirm Real SMS test is off.",
      "No real patients. No PHI.",
    ],
  },
];

console.log("Flowvia cloud staging smoke plan");
console.log("This script does not call the cloud, send SMS, run ngrok, deploy, or print secrets.");
console.log("");
console.log(`Base URL: ${baseUrl}`);
console.log(`SMS consent: ${baseUrl}/sms-consent`);
console.log(`Dashboard: ${baseUrl}/dashboard`);
console.log(`Message Ledger: ${baseUrl}/admin/messages`);
console.log(`Telnyx webhook: ${baseUrl}/api/telnyx/webhook`);
console.log("");

checklist.forEach((section, index) => {
  console.log(`${index + 1}. ${section.title}`);
  for (const item of section.items) {
    console.log(`   - ${item}`);
  }
  console.log("");
});
