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
- SMS consent requires full name, mobile number, opt-in, and PHI disclaimer.
- Abuse controls: honeypot/minimum submit time on contact, in-memory rate limiting, maximum field lengths.
- Safety controls: HTML escaping, generic errors to users, server-side logging without secrets.
- Contact route sends internal notification and submitter autoresponder.
- SMS consent route sends internal notification and submitter autoresponder when email is supplied.
- No SMS is sent from the public SMS consent form.

## Remaining Verification

- Confirm Vercel production `RESEND_API_KEY`.
- Confirm verified sender domain.
- Submit production contact and SMS consent requests.
- Confirm Resend dashboard events, recipient inbox delivery, and autoresponder delivery.
