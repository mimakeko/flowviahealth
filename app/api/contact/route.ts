import { NextResponse } from "next/server";
import { CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL, escapeHtml, getResendClient, isValidEmail, renderRows, textField } from "@/lib/email";

export const runtime = "nodejs";

const MIN_SUBMIT_MS = 2000;

export async function POST(request: Request) {
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

  if (!name || !isValidEmail(email) || !message || !phiAcknowledgement) {
    return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
  }

  const resend = getResendClient();
  if (!resend) {
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

  const { error } = await resend.emails.send({
    from: CONTACT_FROM_EMAIL,
    to: CONTACT_TO_EMAIL,
    replyTo: email,
    subject: "New Flowvia Health website inquiry",
    html,
  });

  if (error) {
    return NextResponse.json({ error: "Email could not be sent." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
