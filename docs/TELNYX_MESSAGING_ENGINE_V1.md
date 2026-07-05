# Telnyx Messaging Engine V1

Flowvia Health has an approved Telnyx 10DLC campaign for transactional customer-care healthcare messaging.

## Approved Telnyx configuration

- Brand: Flowvia Health
- TCR Campaign ID: `CGKHEB9`
- Telnyx Campaign ID: `4b30019f-0fcd-7ac4-6cac-45fe29da1b5d`
- Campaign status: Active / `MNO_PROVISIONED`
- Approved sender number: `+14692933948`
- Messaging profile: `Flowvia_Messaging`
- Use case: Customer Care / transactional healthcare messaging only

Approved scope:

- Appointment scheduling
- Appointment reminders
- Visit coordination
- Therapist arrival notifications
- Patient inquiries
- Care coordination
- Service updates

Forbidden:

- Marketing
- Advertising
- Fundraising
- Promotional blasts
- Mass messaging
- PHI in public forms or casual SMS
- Sending SMS before consent confirmation, except the required confirmation request

## Environment variables

Required for production SMS:

```bash
TELNYX_API_KEY=
TELNYX_MESSAGING_PROFILE_ID=
TELNYX_FLOWVIA_FROM_NUMBER=+14692933948
TELNYX_WEBHOOK_SIGNING_SECRET=
```

`TELNYX_WEBHOOK_SIGNING_SECRET` must contain the Telnyx v2 Ed25519 public key from Mission Control, encoded as hex or base64. Telnyx v2 webhooks include `telnyx-signature-ed25519` and `telnyx-timestamp`; the app verifies the signature over `{timestamp}|{json_payload}` when this variable is configured.

Optional:

```bash
FLOWVIA_ADMIN_MESSAGES_ENABLED=true
FLOWVIA_ALLOW_REAL_SMS_TEST=false
FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=false
FLOWVIA_DATA_MODE=phi_blocked
FLOWVIA_SMS_STORE_MODE=
FLOWVIA_TELNYX_WEBHOOK_SMOKE_BASE_URL=http://localhost:3000
```

`FLOWVIA_ADMIN_MESSAGES_ENABLED=true` exposes `/admin/messages` in production. In development, the page is available without that flag.

SMS storage uses Prisma/Postgres when `DATABASE_URL` is configured. The Message Ledger labels this as `Postgres`. `FLOWVIA_SMS_STORE_MODE=test` uses the JSON test store for route smokes, `FLOWVIA_SMS_STORE_MODE=json` uses an explicit JSON local store, and missing `DATABASE_URL` in local dev uses JSON dev fallback. Production refuses to use local JSON when `DATABASE_URL` is missing.

`FLOWVIA_ALLOW_REAL_SMS_TEST=true` is only for explicit real-send testing. Automated tests and scripts stay dry-run by default.

`FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true` is a development-only bypass for synthetic local route smoke tests when `TELNYX_WEBHOOK_SIGNING_SECRET` is configured. It is forbidden in production and must not be enabled on Vercel or any public deployment. Production-like environments reject webhooks when `TELNYX_WEBHOOK_SIGNING_SECRET` is missing.

`FLOWVIA_DATA_MODE=phi_blocked` is required for staging and production until PHI controls are approved. `phi_allowed` is a future mode and must not be enabled during this pilot.

## Webhook URL

Configure the Telnyx messaging profile webhook URL as:

```text
https://flowviahealth.com/api/telnyx/webhook
```

Local development can use a tunnel URL that forwards to:

```text
http://localhost:3000/api/telnyx/webhook
```

Webhook method must be `POST`.

## Cloud Cutover Checklist

Cloud staging target:

- Telnyx profile: `Flowvia_Messaging`
- Profile ID: `40019f0a-4f48-4749-9d5a-7bb4f0716cbe`
- Number: `+14692933948`
- 10DLC campaign: active / `MNO_PROVISIONED`
- Inbound webhook: `https://flowviahealth.com/api/telnyx/webhook`
- Method: `POST`
- API version: v2-compatible payloads
- Webhook signing: configured in Telnyx and Vercel env via `TELNYX_WEBHOOK_SIGNING_SECRET`

Before cutover:

- Confirm Vercel staging env uses `DATABASE_URL`/`DIRECT_URL` and Message Ledger shows `Storage: Postgres`.
- Confirm `TELNYX_API_KEY` is configured without exposing the value.
- Confirm `TELNYX_MESSAGING_PROFILE_ID=40019f0a-4f48-4749-9d5a-7bb4f0716cbe`.
- Confirm `TELNYX_FLOWVIA_FROM_NUMBER=+14692933948`.
- Confirm `FLOWVIA_ALLOW_REAL_SMS_TEST=false` before and after any controlled test.
- Confirm `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST` is unset or `false`.
- Confirm `FLOWVIA_DATA_MODE=personal_test` or `phi_blocked`.
- Confirm no localhost or ngrok URL remains as the final webhook target.

Keyword Management:

- Disable or clear Telnyx-side `HELP`, `STOP`, and `START` auto replies if duplicate responses happen.
- Keep Flowvia as the source of truth for `YES`/`START`, `HELP`/`INFO`, `STOP`/`UNSUBSCRIBE`/`CANCEL`/`END`/`QUIT`, consent state, audit trail, and Message Ledger.
- Do not weaken Flowvia `STOP` handling.

Local ngrok remains documented for development only. The always-on path is:

```text
Telnyx -> https://flowviahealth.com/api/telnyx/webhook -> Vercel Flowvia -> Supabase/Postgres
```

## Telnyx profile checklist

In Telnyx Mission Control:

- Open Messaging Suite -> Programmable Messaging -> Messaging Profiles -> `Flowvia_Messaging`.
- Confirm the profile ID matches the environment value: `40019f0a-4f48-4749-9d5a-7bb4f0716cbe`.
- Confirm number `+14692933948` is attached.
- Confirm the 10DLC campaign is active / `MNO_PROVISIONED`.
- Confirm inbound webhook URL is configured.
- Confirm webhook method is `POST`.
- Confirm the API version is compatible with the current v2 webhook payloads.
- Confirm the API key exists only in local/Vercel environment variables and is not committed.
- Open Messaging Profile -> Keywords.
- Disable or clear Telnyx-side `HELP`, `STOP`, and `START` auto-replies if duplicate replies occur.
- Keep Flowvia as the single source of truth for keyword responses, consent state, ledger rows, and audit.

## Consent lifecycle

1. Patient visits `https://flowviahealth.com/sms-consent`.
2. Patient enters name, mobile number, optional email, confirms SMS consent, and confirms the no-PHI disclaimer.
3. The app normalizes and validates the phone number as E.164.
4. The app stores an enrollment with status `pending_confirmation`.
5. The app sends this confirmation SMS:

```text
Flowvia Health: Reply YES to confirm enrollment in transactional SMS notifications for appointments, reminders, care coordination, and service updates. Msg & data rates may apply. Reply STOP to opt out.
```

6. Inbound `YES` or `START` marks the enrollment `active`.
7. Inbound `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, or `QUIT` marks the enrollment `opted_out`.
8. Future transactional sends are blocked unless the enrollment is `active`.

## Compliance responses

Opt-in after `YES` or `START`:

```text
Flowvia Health: You are subscribed to transactional SMS notifications for appointment scheduling, reminders, care coordination, and service updates. Message frequency varies. Message and data rates may apply. Reply HELP for assistance or STOP to opt out.
```

Opt-out:

```text
Flowvia Health: You have been unsubscribed and will no longer receive SMS messages. Reply START to subscribe again.
```

Help:

```text
Flowvia Health: Visit https://flowviahealth.com/contact or email support@flowviahealth.com for assistance. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Do not use SMS for emergencies.
```

## Approved Template Registry

All app-generated SMS must come from `lib/sms/templates.ts`. The template guard rejects marketing/promotional language and forbidden clinical placeholders including diagnosis, condition, medication, treatment, symptoms, clinical_note, therapy_plan, wound, and pain_score.

## Internal ledger

`/admin/messages` shows:

- Enrollments and consent status
- Recent inbound and outbound messages
- Delivery status updates
- Opt-out state
- Telnyx configuration status without secrets
- Cloud webhook last seen timestamp
- Latest inbound keyword as `HELP`, `START`, `STOP`, or `UNKNOWN`

The page is read-only and does not provide bulk messaging or manual send controls.

## Cloud Pilot Daily Check

1. Open `/admin/health` and confirm Telnyx API key, messaging profile, approved from number, webhook signing, unsigned bypass, Real SMS gate, and latest SMS timestamps look healthy.
2. Open `/admin/messages` and confirm Cloud webhook last seen, latest inbound keyword, masked phone values, and recent webhook events.
3. Confirm Real SMS gate is Off except during an explicit controlled personal-phone test window.
4. Confirm no Vercel 500s are occurring on SMS or internal admin routes.
5. Confirm no `EMAXCONNSESSION` errors are present.
6. Confirm no TLS/certificate errors are present.
7. Confirm data mode remains `personal_test` or `phi_blocked`; do not enable PHI.

Run config-only checks without sending SMS:

```bash
pnpm telnyx:cloud-readiness
pnpm cloud:route-smoke
```

## Local testing

Run the dry-run messaging checks:

```bash
pnpm test:telnyx
```

The script validates:

- E.164 normalization and validation
- Pending consent cannot receive normal transactional sends
- Confirmation messages can be sent before active consent
- Marketing/promotional copy is rejected
- `YES` activates enrollment
- `HELP` sends the help response
- `STOP` opts the phone out
- Opted-out phones cannot receive future transactional sends
- Delivery status webhooks update the ledger
- Logs do not expose the Telnyx API key

Run the HTTP webhook route smoke against a running local dev server:

```bash
FLOWVIA_SMS_STORE_MODE=test FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true pnpm dev
pnpm telnyx:webhook-smoke
```

The route smoke posts synthetic `YES`, duplicate `YES`, `HELP`, `STOP`, and delivery-status events to `/api/telnyx/webhook`. It verifies duplicate idempotency, enrollment state, ledger rows, webhook event records, and dry-run auto-responses without sending real SMS.

For normal browser/Postgres testing, do not start the dev server with `FLOWVIA_SMS_STORE_MODE=test`. Use:

```bash
FLOWVIA_ALLOW_REAL_SMS_TEST=false pnpm dev
```

With `DATABASE_URL` configured, `/admin/messages` should show `Storage: Postgres`.

For live local inbound testing:

```bash
FLOWVIA_ALLOW_REAL_SMS_TEST=true pnpm dev
ngrok http 3000
```

Set the Telnyx Messaging Profile inbound webhook URL to:

```text
https://<ngrok-domain>/api/telnyx/webhook
```

Then submit `/sms-consent` with a test name and your own phone, reply `YES`, `HELP`, and `STOP`, and verify `/admin/messages`.

Stop local real SMS safely:

- Set `FLOWVIA_ALLOW_REAL_SMS_TEST=false`.
- Stop the dev server.
- Stop ngrok.
- Remove the ngrok URL from the Telnyx Messaging Profile if moving to cloud staging.

For Vercel or a public domain:

- Deploy the latest code.
- Configure `DATABASE_URL`, `DIRECT_URL`, Telnyx env vars, pilot auth env vars, `FLOWVIA_PILOT_OPERATIONS_ENABLED=true`, and `FLOWVIA_ADMIN_MESSAGES_ENABLED=true`.
- Set `FLOWVIA_ALLOW_REAL_SMS_TEST=true` only during controlled live SMS testing.
- Set the Telnyx Messaging Profile inbound webhook URL to `https://flowviahealth.com/api/telnyx/webhook`.
- Use method `POST`.
- Test `YES`, `HELP`, and `STOP`, then turn `FLOWVIA_ALLOW_REAL_SMS_TEST=false` when live testing is complete.
- Confirm the public webhook path is `https://flowviahealth.com/api/telnyx/webhook`.
- Confirm Telnyx webhook signing is configured before testing inbound messages.

## Duplicate HELP Response Audit

The Flowvia webhook records Telnyx event IDs before processing and ignores duplicate event IDs. The app sends one keyword response per newly recorded inbound keyword event. If a personal-phone test receives duplicate `HELP` replies, the likely source is Telnyx Portal Keyword Management auto-reply running in addition to Flowvia. Do not weaken `STOP` handling. Disable or clear Telnyx-side keyword auto-replies and let Flowvia handle `YES`/`START`, `HELP`/`INFO`, and `STOP`/`UNSUBSCRIBE`/`CANCEL`/`END`/`QUIT`.

## No-PHI SMS Rules

- SMS is transactional only.
- No marketing, promotional, advertising, fundraising, or mass messaging.
- No diagnosis, treatment, medication, symptoms, clinical notes, therapy plans, wound details, pain scores, or emergency-care details.
- Use SMS only for consent confirmation, opt-in confirmation, help, opt-out, and approved appointment/service updates.

Run full project checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --audit-level moderate
```

## Production deployment checklist

- Set the Telnyx env vars in the production host.
- Confirm `TELNYX_FLOWVIA_FROM_NUMBER` is exactly `+14692933948`.
- Configure Telnyx messaging profile webhook URL to `/api/telnyx/webhook`.
- Put the Telnyx Ed25519 public key in `TELNYX_WEBHOOK_SIGNING_SECRET`.
- Run `pnpm test:telnyx`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Keep `FLOWVIA_ALLOW_REAL_SMS_TEST=false` unless deliberately testing a live send.
- Replace the local JSON store with a durable production database before high-volume or multi-instance deployment.
- Do not use Flowvia SMS for marketing, advertising, fundraising, promotional blasts, mass messaging, or PHI.
