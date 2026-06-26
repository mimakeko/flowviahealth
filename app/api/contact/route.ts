import { NextResponse } from "next/server";
import {
  CONTACT_FROM_EMAIL,
  CONTACT_TO_EMAIL,
  getClientKey,
  getResendClient,
  isRateLimited,
  isReasonableLength,
  isValidEmail,
  textField,
} from "@/lib/email";
import {
  buildSubmissionSubject,
  FLOWVIA_EMAIL_BRAND,
  renderAutoReplyEmail,
  renderSubmissionEmail,
} from "@/lib/email-design-system";

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

    const submittedAt = new Date();
    const fields = [
      ["Name", name],
      ["Email", email],
      ["Phone", phone],
      ["Organization", organization],
      ["PHI acknowledgement", "Confirmed"],
    ].map(([label, value]) => ({ label, value }));

    const internalEmail = renderSubmissionEmail({
      brand: FLOWVIA_EMAIL_BRAND,
      title: "New Contact Form Submission",
      eyebrow: "Flowvia Health Contact",
      fields,
      sections: [{ label: "Message", value: message }],
      submittedAt,
      notice:
        "Do not reply with protected health information unless an appropriate secure workflow is in place. Flowvia Health is developed and operated by Onzeon Holdings LLC.",
    });

    const autoReplyEmail = renderAutoReplyEmail({
      brand: FLOWVIA_EMAIL_BRAND,
      title: "Thank you for contacting Flowvia Health",
      intro:
        "We received your message and will review it as soon as practical.",
      paragraphs: [
        "Flowvia Health is a healthcare technology platform developed and operated by Onzeon Holdings LLC.",
        "For support, email support@flowviahealth.com. For privacy or SMS consent questions, email privacy@flowviahealth.com.",
        "Please do not send protected health information, medical records, diagnoses, treatment details, or emergency requests through this public website channel.",
      ],
    });

    const [internalResult, autoReplyResult] = await Promise.all([
      resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: CONTACT_TO_EMAIL,
        replyTo: email,
        subject: buildSubmissionSubject({
          title: "New Contact Form Submission",
          brandName: "Flowvia Health",
        }),
        html: internalEmail.html,
        text: internalEmail.text,
      }),
      resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: email,
        replyTo: email,
        subject: "Message Received | Flowvia Health",
        html: autoReplyEmail.html,
        text: autoReplyEmail.text,
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
