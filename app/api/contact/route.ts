import { NextResponse } from "next/server";
import {
  CONTACT_FROM_EMAIL,
  CONTACT_TO_EMAIL,
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

const MIN_SUBMIT_MS = 2000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = textField(formData.get("name"));
    const email = textField(formData.get("email"));
    const phone = textField(formData.get("phone"));
    const organization = textField(formData.get("organization"));
    const message = textField(formData.get("message"));
    const honeypot = textField(formData.get("companyWebsite"));
    const startedAt = Number(textField(formData.get("startedAt")));
    const phiAcknowledgement = formData.get("phiAcknowledgement") === "on";

    if (honeypot || !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_SUBMIT_MS) {
      return NextResponse.json({ error: "Spam protection check failed." }, { status: 400 });
    }

    if (
      !isReasonableLength(name, 120) ||
      !isValidEmail(email) ||
      (phone && phone.length > 40) ||
      (organization && organization.length > 160) ||
      !isReasonableLength(message, 5000) ||
      !phiAcknowledgement
    ) {
      return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
    }

    if (isRateLimited(getClientKey(request, email))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const resend = getResendClient();
    if (!resend) {
      console.error("Flowvia contact email service is not configured.");
      return NextResponse.json({ error: "Email service is not configured." }, { status: 500 });
    }

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0A2540;line-height:1.5;">
        <h1 style="font-size:20px;margin:0 0 16px;">New Flowvia Health website inquiry</h1>
        <table style="border-collapse:collapse;width:100%;max-width:680px;">${renderRows([
          ["Name", name],
          ["Email", email],
          ["Phone", phone],
          ["Organization", organization],
          ["PHI acknowledgement", "Confirmed"],
        ])}</table>
        <h2 style="font-size:16px;margin:24px 0 8px;">Message</h2>
        <p style="white-space:pre-wrap;background:#F5F7FA;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">${escapeHtml(message)}</p>
        <p style="font-size:12px;color:#64748b;">Do not reply with protected health information unless an appropriate secure workflow is in place.</p>
      </div>
    `;

    const autoReplyHtml = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0A2540;line-height:1.5;">
        <h1 style="font-size:20px;margin:0 0 16px;">Thank you for contacting Flowvia Health</h1>
        <p>We received your message and will review it as soon as practical.</p>
        <p>Flowvia Health is a healthcare technology platform developed and operated by Onzeon Holdings LLC.</p>
        <p>For support, email <a href="mailto:support@flowviahealth.com">support@flowviahealth.com</a>. For privacy or SMS consent questions, email <a href="mailto:privacy@flowviahealth.com">privacy@flowviahealth.com</a>.</p>
        <p style="font-size:13px;color:#64748b;">Please do not send protected health information, medical records, diagnoses, treatment details, or emergency requests through this public website channel.</p>
      </div>
    `;

    const [internalResult, autoReplyResult] = await Promise.all([
      resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: CONTACT_TO_EMAIL,
        replyTo: email,
        subject: "New Flowvia Health website inquiry",
        html,
      }),
      resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: email,
        subject: "We received your message | Flowvia Health",
        html: autoReplyHtml,
      }),
    ]);

    if (internalResult.error || autoReplyResult.error) {
      console.error("Flowvia contact email delivery failed.");
      return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.error("Flowvia contact route failed.");
    return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
  }
}
