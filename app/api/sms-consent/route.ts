import { NextResponse } from "next/server";
import {
  CONTACT_FROM_EMAIL,
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

    const submittedAt = new Date();
    const internalEmail = renderSubmissionEmail({
      brand: FLOWVIA_EMAIL_BRAND,
      title: "New SMS Consent Request",
      eyebrow: "Flowvia Health SMS Consent",
      fields: [
        { label: "Full name", value: fullName },
        { label: "Mobile number", value: mobileNumber },
        { label: "Email", value: email },
        { label: "SMS consent checkbox", value: "Confirmed" },
        { label: "PHI disclaimer checkbox", value: "Confirmed" },
      ],
      sections: [
        { label: "Visible confirmation SMS example", value: CONFIRMATION_EXAMPLE },
      ],
      submittedAt,
      notice:
        "No SMS was sent from this request. SMS sending should remain disabled unless a future ENABLE_SMS_SEND=true workflow is explicitly implemented.",
    });

    const sends = [
      resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: SMS_CONSENT_TO_EMAIL,
        replyTo: email || undefined,
        subject: buildSubmissionSubject({
          title: "New SMS Consent Request",
          brandName: "Flowvia Health",
        }),
        html: internalEmail.html,
        text: internalEmail.text,
      }),
    ];

    if (email) {
      const autoReplyEmail = renderAutoReplyEmail({
        brand: FLOWVIA_EMAIL_BRAND,
        title: "Flowvia Health SMS consent request received",
        intro:
          "Flowvia Health received your SMS consent request. SMS consent is not active until a confirmation text is sent and you confirm participation.",
        paragraphs: [
          `Example confirmation message: ${CONFIRMATION_EXAMPLE}`,
          "Flowvia Health is a healthcare technology platform developed and operated by Onzeon Holdings LLC. Do not send protected health information through public website email or forms.",
        ],
      });

      sends.push(
        resend.emails.send({
          from: CONTACT_FROM_EMAIL,
          to: email,
          replyTo: email,
          subject: "SMS Consent Request Received | Flowvia Health",
          html: autoReplyEmail.html,
          text: autoReplyEmail.text,
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
