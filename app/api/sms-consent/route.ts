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
import { CONSENT_CONFIRMATION_SMS, isValidE164Phone, normalizeE164Phone } from "@/lib/sms/compliance";
import { upsertPendingConsent } from "@/lib/sms/store";
import { sendTransactionalSms } from "@/lib/sms/telnyx";

export const runtime = "nodejs";

const SMS_CONSENT_TO_EMAIL = "support@flowviahealth.com";
const CONFIRMATION_EXAMPLE = CONSENT_CONFIRMATION_SMS;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fullName = textField(formData.get("fullName"));
    const mobileNumber = textField(formData.get("mobileNumber"));
    const email = textField(formData.get("email"));
    const smsOptIn = formData.get("smsOptIn") === "on";
    const phiDisclaimer = formData.get("phiDisclaimer") === "on";

    const normalizedMobileNumber = normalizeE164Phone(mobileNumber);

    if (
      !isReasonableLength(fullName, 120) ||
      !isReasonableLength(mobileNumber, 40) ||
      !isValidE164Phone(normalizedMobileNumber) ||
      !smsOptIn ||
      !phiDisclaimer ||
      (email && !isValidEmail(email))
    ) {
      return NextResponse.json({ error: "To enroll, enter your mobile number and provide explicit SMS consent." }, { status: 400 });
    }

    if (isRateLimited(getClientKey(request, email || mobileNumber))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const enrollment = await upsertPendingConsent({
      phone: normalizedMobileNumber,
      name: fullName,
      email: email || undefined,
    });

    await sendTransactionalSms(normalizedMobileNumber, CONSENT_CONFIRMATION_SMS, {
      consentBypassReason: "confirmation_request",
      eventType: "consent.confirmation_request",
      dryRun: process.env.NODE_ENV !== "production" && process.env.FLOWVIA_ALLOW_REAL_SMS_TEST !== "true",
    });

    const resend = getResendClient();
    const submittedAt = new Date();
    if (!resend) {
      console.warn("Flowvia SMS consent email service is not configured; continuing without email notification.");
    } else {
      const internalEmail = renderSubmissionEmail({
        brand: FLOWVIA_EMAIL_BRAND,
        title: "New SMS Consent Request",
        eyebrow: "Flowvia Health SMS Consent",
        fields: [
          { label: "Full name", value: fullName },
          { label: "Mobile number", value: normalizedMobileNumber },
          { label: "Email", value: email },
          { label: "SMS consent checkbox", value: "Confirmed" },
          { label: "PHI disclaimer checkbox", value: "Confirmed" },
          { label: "Consent status", value: enrollment.status },
        ],
        sections: [
          { label: "Visible confirmation SMS example", value: CONFIRMATION_EXAMPLE },
        ],
        submittedAt,
        notice:
          "This request records a voluntary SMS enrollment request from https://flowviahealth.com/sms-consent. Flowvia sends a confirmation SMS after submission, and transactional SMS is enabled only after the recipient replies YES.",
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
            "Flowvia Health received your voluntary SMS enrollment request. SMS consent is not active until the enrollment and confirmation process is completed.",
          paragraphs: [
            `Example confirmation message: ${CONFIRMATION_EXAMPLE}`,
            "Flowvia Health is a healthcare workflow, scheduling, care coordination, and transactional healthcare messaging platform owned, developed, and operated by Onzeon Holdings LLC. Do not send protected health information through public website email or forms.",
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
        console.warn("Flowvia SMS consent email delivery failed; enrollment and SMS flow continued.");
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.error("Flowvia SMS consent route failed.");
    return NextResponse.json({ error: "SMS consent request could not be processed." }, { status: 500 });
  }
}
