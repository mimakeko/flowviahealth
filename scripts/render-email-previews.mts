import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  FLOWVIA_EMAIL_BRAND,
  renderAutoReplyEmail,
  renderSubmissionEmail,
} from "../lib/email-design-system.ts";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(rootDir, "docs", "email-previews");

mkdirSync(outputDir, { recursive: true });

const submittedAt = new Date("2026-06-26T17:35:00-05:00");
const confirmationExample =
  "Flowvia Health: Please reply YES to confirm you want to receive SMS appointment reminders, scheduling updates, and care coordination messages. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for assistance. Terms: https://flowviahealth.com/terms Privacy: https://flowviahealth.com/privacy";

const contactInternal = renderSubmissionEmail({
  brand: FLOWVIA_EMAIL_BRAND,
  title: "New Contact Form Submission",
  eyebrow: "Flowvia Health Contact",
  fields: [
    { label: "Name", value: "Cleverson De Moura Souza" },
    { label: "Email", value: "onzeon@icloud.com" },
    { label: "Phone", value: "949-555-0184" },
    { label: "Organization", value: "Smurfit WestRock" },
    { label: "PHI acknowledgement", value: "Confirmed" },
  ],
  sections: [{ label: "Message", value: "Is this working?" }],
  submittedAt,
  notice:
    "Do not reply with protected health information unless an appropriate secure workflow is in place. Flowvia Health is developed and operated by Onzeon Holdings LLC.",
});

const contactAutoReply = renderAutoReplyEmail({
  brand: FLOWVIA_EMAIL_BRAND,
  title: "Thank you for contacting Flowvia Health",
  intro: "We received your message and will review it as soon as practical.",
  paragraphs: [
    "Flowvia Health is a healthcare technology platform developed and operated by Onzeon Holdings LLC.",
    "For support, email support@flowviahealth.com. For privacy or SMS consent questions, email privacy@flowviahealth.com.",
    "Please do not send protected health information, medical records, diagnoses, treatment details, or emergency requests through this public website channel.",
  ],
});

const smsInternal = renderSubmissionEmail({
  brand: FLOWVIA_EMAIL_BRAND,
  title: "New SMS Consent Request",
  eyebrow: "Flowvia Health SMS Consent",
  fields: [
    { label: "Full name", value: "Cleverson De Moura Souza" },
    { label: "Mobile number", value: "949-555-0184" },
    { label: "Email", value: "onzeon@icloud.com" },
    { label: "SMS consent checkbox", value: "Confirmed" },
    { label: "PHI disclaimer checkbox", value: "Confirmed" },
  ],
  sections: [{ label: "Visible confirmation SMS example", value: confirmationExample }],
  submittedAt,
  notice:
    "No SMS was sent from this request. SMS sending should remain disabled unless a future ENABLE_SMS_SEND=true workflow is explicitly implemented.",
});

const smsAutoReply = renderAutoReplyEmail({
  brand: FLOWVIA_EMAIL_BRAND,
  title: "Flowvia Health SMS consent request received",
  intro:
    "Flowvia Health received your SMS consent request. SMS consent is not active until a confirmation text is sent and you confirm participation.",
  paragraphs: [
    `Example confirmation message: ${confirmationExample}`,
    "Flowvia Health is a healthcare technology platform developed and operated by Onzeon Holdings LLC. Do not send protected health information through public website email or forms.",
  ],
});

writePreview("flowvia-contact-internal", contactInternal.html, contactInternal.text);
writePreview("flowvia-contact-autoresponder", contactAutoReply.html, contactAutoReply.text);
writePreview("flowvia-sms-consent-internal", smsInternal.html, smsInternal.text);
writePreview("flowvia-sms-consent-autoresponder", smsAutoReply.html, smsAutoReply.text);

writeFileSync(
  join(outputDir, "index.html"),
  renderIndex([
    {
      name: "Flowvia contact internal",
      subject: "New Contact Form Submission | Flowvia Health",
      file: "flowvia-contact-internal.preview.html",
    },
    {
      name: "Flowvia contact autoresponder",
      subject: "Message Received | Flowvia Health",
      file: "flowvia-contact-autoresponder.preview.html",
    },
    {
      name: "Flowvia SMS consent internal",
      subject: "New SMS Consent Request | Flowvia Health",
      file: "flowvia-sms-consent-internal.preview.html",
    },
    {
      name: "Flowvia SMS consent autoresponder",
      subject: "SMS Consent Request Received | Flowvia Health",
      file: "flowvia-sms-consent-autoresponder.preview.html",
    },
  ]),
);

function writePreview(name: string, html: string, text: string) {
  writeFileSync(join(outputDir, `${name}.email.html`), html);
  writeFileSync(join(outputDir, `${name}.txt`), text);
  writeFileSync(join(outputDir, `${name}.preview.html`), renderPreviewPage(name, html));
}

function renderPreviewPage(name: string, html: string) {
  const srcdoc = escapeAttribute(html);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(name)} email preview</title>
  </head>
  <body style="margin:0;background:#eef2f7;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <main style="padding:24px;">
      <h1 style="margin:0 0 18px;color:#111827;font-size:24px;line-height:32px;">${escapeHtml(name)} email preview</h1>
      <section style="margin-bottom:24px;">
        <h2 style="color:#111827;font-size:16px;line-height:22px;">Desktop light</h2>
        <iframe title="${escapeHtml(name)} desktop light" srcdoc="${srcdoc}" style="width:760px;max-width:100%;height:900px;border:1px solid #cbd5e1;background:#ffffff;"></iframe>
      </section>
      <section style="margin-bottom:24px;">
        <h2 style="color:#111827;font-size:16px;line-height:22px;">Mobile light</h2>
        <iframe title="${escapeHtml(name)} mobile light" srcdoc="${srcdoc}" style="width:390px;max-width:100%;height:900px;border:1px solid #cbd5e1;background:#ffffff;"></iframe>
      </section>
      <section style="margin-bottom:24px;background:#111827;padding:18px;">
        <h2 style="color:#ffffff;font-size:16px;line-height:22px;">Desktop dark preview background</h2>
        <iframe title="${escapeHtml(name)} desktop dark" srcdoc="${srcdoc}" style="width:760px;max-width:100%;height:900px;border:1px solid #334155;background:#111827;"></iframe>
      </section>
      <section style="margin-bottom:24px;background:#111827;padding:18px;">
        <h2 style="color:#ffffff;font-size:16px;line-height:22px;">Mobile dark preview background</h2>
        <iframe title="${escapeHtml(name)} mobile dark" srcdoc="${srcdoc}" style="width:390px;max-width:100%;height:900px;border:1px solid #334155;background:#111827;"></iframe>
      </section>
    </main>
  </body>
</html>`;
}

function renderIndex(
  previews: Array<{ name: string; subject: string; file: string }>,
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Flowvia Health email previews</title>
  </head>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <main style="padding:32px;max-width:860px;">
      <h1 style="margin:0 0 18px;color:#111827;font-size:28px;line-height:36px;">Flowvia Health email previews</h1>
      <ul style="padding-left:20px;color:#111827;font-size:16px;line-height:26px;">
        ${previews.map((preview) => `<li style="color:#111827;margin-bottom:12px;"><a href="./${preview.file}" style="color:#1d4edb;">${escapeHtml(preview.name)}</a><br><span style="color:#526071;">${escapeHtml(preview.subject)}</span></li>`).join("")}
      </ul>
    </main>
  </body>
</html>`;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
