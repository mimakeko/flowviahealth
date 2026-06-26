import { NextResponse } from "next/server";
import {
  CONTACT_FROM_EMAIL,
  escapeHtml,
  getClientKey,
  getResendClient,
  isRateLimited,
  isReasonableLength,
  isValidEmail,
  renderRows,
  textField,
} from "@/lib/email";

export const runtime = "nodejs";

const SMS_CONSENT_TO_EMAIL = "support@flowviahealth.com";
const CONFIRMATION_EXAMPLE = "Flowvia Health: Please reply YES to confirm you want to receive SMS appointment reminders, scheduling updates, and care coordination messages. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for assistance. Terms: https://flowviahealth.com/terms Privacy: https://flowviahealth.com/privacy";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fullName = textField(formData.get("fullName"));
    const mobileNumber = textField(formData.get("mobileNumber"));
    const email = textField(formData.get("email"));
    const smsOptIn = formData.get("smsOptIn") === "on";
    const phiDisclaimer = formData.get("phiDisclaimer") === "on";

    if (
      !isReasonableLength(fullName, 120) ||
      !isReasonableLength(mobileNumber, 40) ||
      !smsOptIn ||
      !phiDisclaimer ||
      (email && !isValidEmail(email))
    ) {
      return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
    }

    if (isRateLimited(getClientKey(request, email || mobileNumber))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const resend = getResendClient();
    if (!resend) {
      console.error("Flowvia SMS consent email service is not configured.");
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

    const sends = [
      resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: SMS_CONSENT_TO_EMAIL,
        replyTo: email || undefined,
        subject: "New Flowvia Health SMS consent request",
        html,
      }),
    ];

    if (email) {
      sends.push(
        resend.emails.send({
          from: CONTACT_FROM_EMAIL,
          to: email,
          subject: "Flowvia Health SMS consent request received",
          html: `
            <div style="font-family:Inter,Arial,sans-serif;color:#0A2540;line-height:1.5;">
              <h1 style="font-size:20px;margin:0 0 16px;">SMS consent request received</h1>
              <p>Flowvia Health received your SMS consent request. SMS consent is not active until a confirmation text is sent and you confirm participation.</p>
              <p>Example confirmation message:</p>
              <p style="white-space:pre-wrap;background:#F5F7FA;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">${escapeHtml(CONFIRMATION_EXAMPLE)}</p>
              <p style="font-size:13px;color:#64748b;">Flowvia Health is a healthcare technology platform developed and operated by Onzeon Holdings LLC. Do not send protected health information through public website email or forms.</p>
            </div>
          `,
        }),
      );
    }

    const results = await Promise.all(sends);

    if (results.some((result) => result.error)) {
      console.error("Flowvia SMS consent email delivery failed.");
      return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.error("Flowvia SMS consent route failed.");
    return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
  }
}
