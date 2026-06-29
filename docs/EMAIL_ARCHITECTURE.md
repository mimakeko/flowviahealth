# Email Architecture

Date: June 26, 2026  
Project: Flowvia Health

## Current Architecture

- Provider: Resend.
- Contact endpoint: `POST /api/contact`.
- SMS consent endpoint: `POST /api/sms-consent`.
- Internal recipient: `CONTACT_TO_EMAIL`, default `support@flowviahealth.com`.
- Sender: `CONTACT_FROM_EMAIL`, default `Flowvia Health Website <onboarding@resend.dev>`.

## Standard Controls

- Required contact fields: name, valid email, message, PHI acknowledgement.
- SMS enrollment requires full name, mobile number, explicit user-initiated SMS consent, and PHI disclaimer before the server accepts the request. The public SMS consent checkbox remains visible, unchecked by default, and not browser-forced.
- Abuse controls: honeypot/minimum submit time on contact, in-memory rate limiting, maximum field lengths.
- Safety controls: HTML escaping, generic errors to users, server-side logging without secrets.
- Contact route sends internal notification and submitter autoresponder.
- SMS consent route sends internal notification and submitter autoresponder when email is supplied.
- The public SMS consent form records a voluntary enrollment request. It does not instantly send an SMS; transactional SMS is enabled only after enrollment and confirmation are completed.

## Remaining Verification

- Confirm Vercel production `RESEND_API_KEY`.
- Confirm verified sender domain.
- Submit production contact and SMS consent requests.
- Confirm Resend dashboard events, recipient inbox delivery, and autoresponder delivery.
