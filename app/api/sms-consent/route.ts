import { NextResponse } from "next/server";
import { CONTACT_FROM_EMAIL, escapeHtml, getResendClient, isValidEmail, renderRows, textField } from "@/lib/email";

export const runtime = "nodejs";

const SMS_CONSENT_TO_EMAIL = "support@flowviahealth.com";
const CONFIRMATION_EXAMPLE = "Flowvia Health: Please reply YES to confirm you want to receive SMS appointment reminders, scheduling updates, and care coordination messages. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for assistance. Terms: https://flowviahealth.com/terms Privacy: https://flowviahealth.com/privacy";

export async function POST(request: Request) {
  const formData = await request.formData();
  const fullName = textField(formData.get("fullName"));
  const mobileNumber = textField(formData.get("mobileNumber"));
  const email = textField(formData.get("email"));
  const smsOptIn = formData.get("smsOptIn") === "on";
  const phiDisclaimer = formData.get("phiDisclaimer") === "on";

  if (!fullName || !mobileNumber || !smsOptIn || !phiDisclaimer || (email && !isValidEmail(email))) {
    return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json({ error: "Email service is not configured." }, { status: 500 });
  }

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0A2540;line-height:1.5;">
      <h1 style="font-size:20px;margin:0 0 16px;">New Flowvia Health SMS consent request</h1>
      <table style="border-collapse:collapse;width:100%;max-width:680px;">${renderRows([
        ["Full name", fullName],
        ["Mobile number", mobileNumber],
        ["Email", email],
        ["SMS consent checkbox", "Confirmed"],
        ["PHI disclaimer checkbox", "Confirmed"],
      ])}</table>
      <p style="margin-top:24px;font-size:13px;color:#64748b;">No SMS was sent from this request. SMS sending should remain disabled unless a future ENABLE_SMS_SEND=true workflow is explicitly implemented.</p>
      <h2 style="font-size:16px;margin:24px 0 8px;">Visible confirmation SMS example</h2>
      <p style="white-space:pre-wrap;background:#F5F7FA;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">${escapeHtml(CONFIRMATION_EXAMPLE)}</p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: CONTACT_FROM_EMAIL,
    to: SMS_CONSENT_TO_EMAIL,
    replyTo: email || undefined,
    subject: "New Flowvia Health SMS consent request",
    html,
  });

  if (error) {
    return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
