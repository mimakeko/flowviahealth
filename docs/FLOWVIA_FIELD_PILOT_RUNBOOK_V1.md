# Flowvia Field Pilot Runbook V1

This runbook is for a small Flowvia pilot with 1-2 therapists. The goal is to validate scheduling, consent, SMS delivery, opt-out handling, and the internal ledger before building a larger operating system.

## Dashboard-first rule

Flowvia operational work starts from the internal dashboard. New admin, referral, message, therapist, visit, SMS, and audit features must be integrated into the shared dashboard/workspace shell instead of being shipped as disconnected standalone pages.

The public website stays separate from the internal dashboard. Public navigation must not expose private dashboard, admin, therapist, or message-ledger routes.

Internal operational data should read from Prisma/Postgres through `DATABASE_URL`. Do not add local file, DuckDB, or static placeholder storage for dashboard operational state. The JSON SMS store remains dev/test-only fallback behavior.

## Pilot scope

Use this only for:

- 1-2 active therapists
- A small number of patient referrals
- Transactional appointment, reminder, care coordination, and service update SMS
- Manual operational oversight through environment-gated admin pages

Do not use this for:

- Marketing messages
- Bulk campaigns
- PHI over casual SMS
- Broad admin access
- High-volume dispatch

## Route map

Public website routes:

- `/`
- `/sms-consent`
- `/privacy`
- `/terms`
- `/hipaa`
- `/contact`

Internal dashboard/admin/workspace routes:

- `/dashboard`: Prisma-backed pilot operations overview.
- `/admin/referrals`: admin referral operations queue.
- `/admin/referrals/new`: manual fake-data referral intake for pilot testing.
- `/admin/referrals/[id]`: referral detail, assignment, visit, and audit view.
- `/admin/visits`: admin visit operations queue.
- `/admin/visits/new`: manual fake-data visit scheduling.
- `/admin/visits/[id]`: visit lifecycle detail and audit view.
- `/admin/scheduling`: admin-only deterministic scheduling intelligence.
- `/admin/messages`: read-only SMS consent/message ledger.
- `/admin/health`: admin-only cloud pilot health center.
- `/admin/audit`: admin-only audit trail with safe metadata summaries.
- `/admin/data`: admin-only data stewardship for fake/personal-number pilot data.
- `/my-work`: therapist demo worklist.

Internal routes use the shared dashboard shell and sidebar after pilot login. Public pages use the public website header/footer.

## Setup

1. Provision a managed Postgres database.
2. Set production/staging env vars:

```bash
# Vercel/serverless runtime: Supabase transaction pooler, usually port 6543, with SSL required.
DATABASE_URL=postgresql://...
# Prisma migrations/admin operations: Supabase direct/session URL, usually port 5432, with SSL required.
DIRECT_URL=postgresql://...
RESEND_API_KEY=
TELNYX_API_KEY=
TELNYX_MESSAGING_PROFILE_ID=
TELNYX_FLOWVIA_FROM_NUMBER=+14692933948
TELNYX_WEBHOOK_SIGNING_SECRET=
FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=false
FLOWVIA_ADMIN_MESSAGES_ENABLED=true
FLOWVIA_PILOT_OPERATIONS_ENABLED=true
FLOWVIA_ALLOW_REAL_SMS_TEST=false
FLOWVIA_DATA_MODE=phi_blocked
FLOWVIA_ADMIN_EMAIL=
FLOWVIA_ADMIN_PASSWORD_HASH=
FLOWVIA_THERAPIST_EMAILS=
FLOWVIA_THERAPIST_PASSWORD_HASH=
FLOWVIA_SESSION_SECRET=
FLOWVIA_AUTH_SMOKE_EMAIL=
FLOWVIA_AUTH_SMOKE_PASSWORD=
FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL=
FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD=
FLOWVIA_AUTH_ROUTE_SMOKE_BASE_URL=http://localhost:3000
FLOWVIA_TELNYX_WEBHOOK_SMOKE_BASE_URL=http://localhost:3000
```

3. Apply migrations:

```bash
pnpm db:deploy
```

4. Generate Prisma Client during build/install:

```bash
pnpm db:generate
```

5. Configure Telnyx webhook:

```text
https://flowviahealth.com/api/telnyx/webhook
```

## Pilot auth setup

Flowvia uses a minimal signed httpOnly cookie gate for the field pilot. This is secure enough for staging and tightly controlled 1-2 therapist validation, but it is not final enterprise authentication.

Required env vars:

- `FLOWVIA_ADMIN_EMAIL`: admin login email.
- `FLOWVIA_ADMIN_PASSWORD_HASH`: scrypt hash for the admin password.
- `FLOWVIA_THERAPIST_EMAILS`: comma-separated therapist login emails.
- `FLOWVIA_THERAPIST_PASSWORD_HASH`: scrypt hash for the therapist pilot password.
- `FLOWVIA_SESSION_SECRET`: random secret at least 32 characters long.

Generate password hashes without printing the password:

```bash
FLOWVIA_PASSWORD_TO_HASH='replace-with-a-long-random-password' pnpm auth:hash
```

Store only the resulting hash in the environment. Do not commit plaintext passwords, hashes, session secrets, database URLs, Telnyx keys, Resend keys, or screenshots showing secrets.

Pilot login:

- Open `/login`.
- Admin signs in with `FLOWVIA_ADMIN_EMAIL` and the password matching `FLOWVIA_ADMIN_PASSWORD_HASH`.
- Therapist signs in with an email listed in `FLOWVIA_THERAPIST_EMAILS` and the password matching `FLOWVIA_THERAPIST_PASSWORD_HASH`.
- Logout is available in the dashboard shell header.

Role behavior:

- Admin can access `/dashboard`, `/admin/*`, `/admin/messages`, and `/my-work`.
- Therapist can access `/dashboard` and `/my-work`.
- Therapist cannot access `/admin/referrals`, `/admin/referrals/new`, `/admin/referrals/[id]`, or `/admin/messages`.
- Therapist `/my-work` is scoped to the active `Therapist.email` row matching the login email.

Auth smoke env vars:

- `FLOWVIA_AUTH_SMOKE_EMAIL`: admin email used by auth smoke.
- `FLOWVIA_AUTH_SMOKE_PASSWORD`: plaintext admin password used only by local smoke.
- `FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL`: therapist email used by route smoke.
- `FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD`: plaintext therapist password used only by local smoke.
- `FLOWVIA_AUTH_ROUTE_SMOKE_BASE_URL`: local server URL for route smoke, usually `http://localhost:3000`.

`pnpm auth:smoke` verifies password hashes and, when smoke credentials are present, verifies configured admin/therapist credentials through the same helper used by login.

`pnpm auth:route-smoke` expects the dev server to be running and verifies public routes, the login POST route, admin access, therapist `/my-work`, and therapist blocks from admin routes.

Protected routes:

- `/dashboard`
- `/admin`
- `/admin/messages`
- `/admin/referrals`
- `/admin/referrals/new`
- `/admin/referrals/[id]`
- `/admin/visits`
- `/admin/visits/new`
- `/admin/visits/[id]`
- `/admin/scheduling`
- `/admin/health`
- `/admin/audit`
- `/admin/data`
- `/my-work`

Public or webhook routes that remain unprotected:

- `/`
- `/contact`
- `/sms-consent`
- `/privacy`
- `/terms`
- `/hipaa`
- `/api/sms-consent`
- `/api/telnyx/webhook`

## Local safety checks

Run:

```bash
pnpm db:generate
pnpm auth:smoke
pnpm test:telnyx
pnpm ops:guardrail-smoke
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --audit-level moderate
```

With the dev server running and smoke credentials configured, also run:

```bash
pnpm auth:route-smoke
pnpm sms-consent:route-smoke
pnpm telnyx:webhook-smoke
```

The Telnyx test is dry-run by default and uses JSON test storage. It does not send real SMS unless code is explicitly changed and `FLOWVIA_ALLOW_REAL_SMS_TEST=true`.

Also run readiness guardrails:

```bash
pnpm cloud:readiness
pnpm hipaa:readiness
```

## Daily pilot workflow

Admins should run each pilot day from the internal dashboard shell:

1. Open `/admin/health` and confirm deploy target, data mode, database pooler mode, webhook signing, Telnyx readiness, SMS store mode, AI mock/no-PHI state, and latest activity timestamps.
2. Open `/admin/messages` and review the Message Ledger for consent state, masked phone values, latest inbound keyword, webhook activity, and delivery status. Do not use bulk messaging.
3. Open `/admin/referrals`, filter for `New`, `Contacted`, or `Needs scheduling`, then assign therapists and schedule visits from referral detail pages.
4. Open `/admin/visits`, filter for `Upcoming`, `Needs scheduling`, or in-progress statuses, then update only operational lifecycle status and no-PHI notes.
5. Have therapists use `/my-work` for their assigned referrals and visits. Therapist actions remain limited to manual operational status and notes; no assignment, SMS send, autonomous action, clinical note, or bulk controls are exposed.
6. Open `/admin/audit` and review recent audit events for expected status changes, assignment changes, visit updates, SMS consent events, and permission denials.
7. Open `/admin/data` only when fake pilot data needs stewardship. Use archive/refresh tools with exact confirmation text and verify audit events afterward.
8. Keep all notes free of PHI: no diagnosis, symptoms, treatment details, medication, emergency details, wound details, therapy plans, pain scores, full addresses, or clinical narratives.
9. Keep real SMS testing personal-number-only. `FLOWVIA_ALLOW_REAL_SMS_TEST` must stay `false` except during an explicit controlled owner-phone test window.

## Pilot Data Stewardship Policy

- Pilot data is fake data only, except controlled owner personal-number SMS tests.
- PHI remains blocked. Do not enter real patient data, clinical notes, diagnosis, treatment details, medication, symptoms, wound details, therapy plans, pain scores, or emergency details.
- Do not delete audit logs. Audit rows must remain available even when fake operational records are archived.
- Do not delete SMS consent enrollments, SMS messages, or Telnyx webhook history from dashboard tools.
- Prefer archive over delete. `/admin/data` archives completed/canceled fake referrals and smoke-test operational records by marking operational notes, not by deleting audit/SMS history.
- Personal-number tests should end in `opted_out` unless active testing is underway.
- Data stewardship actions must not send real SMS and must not expose full phone numbers, raw SMS bodies, secrets, or provider payloads.
- Run `pnpm data:inventory` for safe counts only and `pnpm data:stewardship-smoke` to validate cleanup guardrails.

## No-PHI AI Operations Assistant Policy

- Operations Assistant V2 is deterministic/mock-only in this pilot.
- It is not clinical AI and must not provide diagnosis, treatment guidance, triage, or clinical recommendations.
- It must not call OpenAI or any external AI API.
- It must not take autonomous actions, schedule visits, assign therapists, send SMS, or mutate records.
- It may provide safe operational next-step cards, queue risk signals, scheduling readiness hints, and suggested operational note rewrites.
- It must not use PHI in prompts or outputs. Suggestions are generated from safe workflow state and aggregate counts only.
- Human review is required before acting on any assistant suggestion.
- Passive assistant suggestions are not audit events; blocked-note attempts and explicit user actions remain audited.
- Run `pnpm ai:ops-smoke` to verify deterministic assistant outputs, opt-out warnings, assignment warnings, past-visit warnings, safe wording, and no external API mode.

## Scheduling Intelligence Policy

- Scheduling Intelligence V1 is deterministic only.
- It does not use external maps, geocoding APIs, route optimization, or real travel-time calculation.
- It uses fake pilot city, ZIP family, therapist service-area text, active status, visit timing, and workflow status only.
- Suggested windows are limited to the next 5 business days in the configured operations timezone and use safe local slots only: 9:00 AM, 11:00 AM, 1:00 PM, and 3:00 PM.
- The New Visit `Use this window` action fills the scheduled datetime field only; it does not submit the form, create a visit, assign a therapist, send SMS, or bypass human review.
- It must not use PHI, full street addresses, raw SMS bodies, secrets, diagnosis, treatment details, or clinical guidance.
- It must not create visits, assign therapists, send SMS, or perform autonomous scheduling.
- Suggested windows are operational suggestions only and require human review in the existing visit creation/update flows.
- Passive scheduling suggestions are not audit events; explicit user actions such as `visit_created`, `visit_status_changed`, and `therapist_assigned` remain audited.
- Run `pnpm scheduling:intelligence-smoke` to verify fit scoring, readiness, conflicts, suggested windows, deterministic source, and no external API mode.

## Therapist Field Visit Workflow Policy

- `/my-work` is the therapist-facing field workflow inside the dashboard shell.
- Assigned visits are shown before referrals in Today, Upcoming, and Completed recently sections.
- Manual visit actions are limited to: Start visit, Mark completed, Mark no-show, and Mark canceled.
- Allowed transitions are deterministic: `scheduled -> in_progress`, `scheduled/in_progress -> completed`, `scheduled/in_progress -> no_show`, and `scheduled/in_progress -> canceled`.
- Terminal visits (`completed`, `no_show`, `canceled`) show an operational warning and cannot be changed from the therapist field workflow.
- Notes are operational-only and are blocked by note classification if they include diagnosis, treatment, medication, symptoms, measurements, clinical notes, PHI-like content, or SMS-forbidden content.
- If SMS consent is opted out, `/my-work` warns to use non-SMS operational follow-up only; it does not block field work and does not send SMS.
- Completing a future scheduled visit is allowed only by manual submit and is audited with an early-completion warning.
- Therapist field actions write safe audit events: `therapist_visit_started`, `therapist_visit_completed`, `therapist_visit_no_show`, `therapist_visit_canceled`, and `therapist_visit_note_blocked`.
- Run `pnpm therapist:field-smoke` to verify assigned-only updates, blocked unsafe notes, audit writes, no SMS, no external APIs, and admin-route RBAC.

## Supabase staging checks

Use Supabase staging for database validation before putting real pilot operations into the system.

1. Confirm Vercel `DATABASE_URL` is the Supabase transaction pooler URL for serverless runtime, usually port `6543`, with SSL required.
2. Confirm `DIRECT_URL` is the Supabase direct/session URL for Prisma migrations/admin operations, usually port `5432`, with SSL required.
3. Confirm `DATABASE_URL` and `DIRECT_URL` are not identical in staging/production.
4. Do not print `DATABASE_URL`, `DIRECT_URL`, or any Supabase credentials in terminal output, logs, screenshots, or tickets.
5. Generate the Prisma Client:

```bash
pnpm db:generate
```

6. Apply migrations if they have not already been deployed:

```bash
pnpm db:deploy
```

7. Run the smoke test:

```bash
pnpm db:smoke
```

`pnpm db:smoke` verifies that `DATABASE_URL` exists without printing it, connects through `lib/db/prisma.ts`, confirms every required model is queryable, performs fake create/read/update checks, inserts a fake audit row, and does not send SMS.

The smoke test also executes the dashboard query shapes for:

- Open referrals.
- Ready/scheduled referrals.
- Active/completed referrals.
- Pending SMS consent.
- Recent audit activity.
- Active therapists.
- Upcoming visits.
- Recent referrals.

### Supabase serverless pooling

Vercel runtime must use Supabase transaction pooling through `DATABASE_URL`. Do not point Vercel `DATABASE_URL` at the Supabase session/direct URL on port `5432`; that can exhaust the session client limit and return 500s on internal routes.

Use this split:

- `DATABASE_URL`: Supabase transaction pooler, usually port `6543`, for Vercel/serverless runtime.
- `DIRECT_URL`: Supabase direct/session URL, usually port `5432`, for Prisma migrations/admin operations.

If Vercel logs show `(EMAXCONNSESSION) max clients reached in session mode`, switch Vercel `DATABASE_URL` to the transaction pooler URL, keep `DIRECT_URL` on direct/session, redeploy, and re-test `/dashboard`, `/admin/referrals`, and `/admin/visits`.

## Seeding fake pilot data

Seed obvious fake 1-2 therapist pilot data with:

```bash
pnpm db:seed
```

The seed script creates only fake records:

- `Demo Therapist North Dallas`
- `Demo Therapist Plano/Frisco`
- 5 `Demo Patient ...` referrals
- 2 fake scheduled visits
- supporting seed audit rows

The script is repeatable. It deletes/recreates only rows marked with the demo seed source and uses fake `+1555010....` phone numbers plus `.test` email domains.

## Supabase Table Editor verification

After `pnpm db:seed` or `pnpm db:smoke`, open the Supabase project and check Table Editor rows for:

- `Therapist`: demo therapists or smoke therapist.
- `PatientReferral`: fake demo/smoke referrals; do not add real PHI during testing.
- `Visit`: fake scheduled visits linked to fake referrals.
- `SmsConsentEnrollment`: only fake smoke SMS contact rows unless testing real consent.
- `SmsMessage`: dry-run smoke message rows only; no real SMS is sent by seed or smoke.
- `TelnyxWebhookEvent`: fake smoke webhook event rows.
- `AuditLog`: seed or smoke audit rows.

When reviewing Table Editor, avoid copying connection strings, access tokens, patient data, or secrets into notes or screenshots.

## 2026-07-02 Working Milestone

- Public website routes work.
- Dashboard-first internal architecture works.
- Supabase/Postgres via Prisma works.
- Admin and therapist auth work.
- RBAC blocks therapist access to admin referrals and Message Ledger.
- Message Ledger works.
- SMS consent route works.
- Telnyx outbound real SMS worked to owner personal phone.
- Telnyx inbound webhook worked through ngrok.
- `YES`, `HELP`, and `STOP` worked live.
- `STOP` correctly set the test user to opted_out.
- Postgres ledger showed live SMS activity.

Boundary: personal phone numbers only, fake/non-PHI data only, no real patients.

## Tomorrow Cloud Staging Plan

Mission: `FLOWVIA_CLOUD_STAGING_ALWAYS_ON_PILOT_V1`.

Manual first steps:

1. Review `git status`.
2. Commit.
3. Push.
4. Configure Vercel env vars.
5. Deploy.
6. Set Telnyx webhook to `https://flowviahealth.com/api/telnyx/webhook`.
7. Test with personal phone only.
8. Turn real SMS off.

## Cloud Pilot Daily Check

1. Open `/admin/health`.
2. Confirm deploy target, data mode, Real SMS gate, AI mode/no-PHI mode, SMS store mode, database storage mode, webhook signing, and Telnyx config are healthy.
3. Confirm `DATABASE_URL` mode is transaction/port `6543` for Vercel runtime and `DIRECT_URL` mode is session/port `5432` for Prisma migrations/admin operations.
4. Open `/admin/messages`.
5. Confirm Cloud webhook last seen, latest inbound keyword, masked phone values, consent state, and recent webhook rows.
6. Confirm Real SMS gate is Off except during an explicit controlled personal-phone test window.
7. Confirm Vercel has no 500s on `/dashboard`, `/admin/referrals`, `/admin/visits`, `/admin/messages`, or `/admin/health`.
8. Confirm no `EMAXCONNSESSION` errors are present.
9. Confirm no TLS/certificate errors are present.
10. Confirm data mode remains `personal_test` or `phi_blocked`; do not enable PHI.

Optional safe checks:

```bash
pnpm cloud:readiness
pnpm cloud:route-smoke
pnpm db:pool-smoke
pnpm telnyx:cloud-readiness
```

## No-PHI / Personal-Test Boundary

- Keep `FLOWVIA_DATA_MODE=phi_blocked`.
- Use fake data and owner personal phone only.
- Do not enter real patients, PHI, clinical notes, diagnoses, treatment details, medications, symptoms, therapy plans, wound details, or pain scores.
- Message Ledger is read-only and masked by default.

## Stop Local Real SMS Safely

1. Set `FLOWVIA_ALLOW_REAL_SMS_TEST=false`.
2. Stop the local dev server.
3. Stop ngrok.
4. Remove or replace the ngrok URL in Telnyx before cloud testing.
5. Confirm `/admin/messages` shows final opt-out/ledger state.

## Message Ledger SMS Chain Verification

Use `/admin/messages` to verify:

- Storage mode.
- API key configured status.
- Messaging profile configured status.
- Webhook signing status.
- Consent enrollments.
- Active/opted-out status.
- Recent messages.
- Recent webhook events.
- Warnings for real SMS mode, webhook signing dev skip, unsigned webhook bypass, and no-PHI data mode.

## Field Pilot Operations Workflow

The workflow layer is dashboard-first. Admins use `/dashboard`, `/admin/referrals`, `/admin/visits`, `/admin/messages`, and `/my-work`; therapists use `/dashboard` and `/my-work` only.

### Admin Creates Fake Referral

1. Sign in as admin.
2. Open `/admin/referrals/new`.
3. Enter fake/test name, fake/test phone, optional `.test` email, target city, target ZIP, and service area/workflow type.
4. Keep the status in the allowed workflow values: `new`, `contacted`, `scheduled`, `active`, `completed`, or `canceled`.
5. Add only non-clinical operational notes. Do not enter diagnosis, treatment detail, clinical notes, emergency notes, medication, symptoms, wound details, therapy plans, or pain scores.

### Admin Assigns Therapist

1. Open `/admin/referrals`.
2. Open a referral detail page.
3. Set Assigned therapist.
4. Save referral.
5. Confirm the audit trail records `referral_updated` and `therapist_assigned` when the assignment changes.

### Admin Schedules Visit

1. Open `/admin/visits/new` or use the Visits section on a referral detail page.
2. Select referral.
3. Select therapist.
4. Set scheduled date/time.
5. Set visit status: `unscheduled`, `scheduled`, `in_progress`, `completed`, `canceled`, or `no_show`.
6. Add only non-clinical operational notes.
7. Confirm `/admin/visits` and the referral detail audit trail show the visit.

### Therapist Sees `/my-work`

1. Sign in as a therapist whose email matches an active `Therapist.email`.
2. Open `/my-work`.
3. Confirm only assigned referrals and assigned visits appear.
4. Use referral actions for operational workflow updates.
5. Use visit actions to mark visits `in_progress`, `completed`, or `no_show`.
6. Confirm therapist cannot access `/admin/referrals`, `/admin/visits`, or `/admin/messages`.

### What Remains Fake / No-PHI

- All referrals are fake/test referrals.
- All patient names and phone numbers must be fake/test unless explicitly performing controlled owner personal-phone SMS testing.
- Phone numbers are masked in dashboard views by default.
- Operational notes must remain non-clinical.
- Public forms and internal workflows must not contain PHI during this pilot.

### What SMS Does And Does Not Do

- SMS readiness indicators show consent status, safe template availability, and real SMS gate status.
- Referral/visit workflows do not send SMS.
- Any future send button must stay disabled by default and explain that real SMS requires `FLOWVIA_ALLOW_REAL_SMS_TEST=true`, personal-number-only testing, and no PHI.
- Message Ledger remains admin-only.

### Blocked Before Real Patients

- Production auth/MFA/account recovery/user lifecycle.
- Vendor BAA review.
- Backup/restore, retention/deletion, incident response, and audit review process.
- Telnyx public webhook signing configured and verified.
- Temporary pilot passwords rotated.
- Duplicate Telnyx keyword auto-response source resolved if it appears again.

After using the operations UI, verify `AuditLog` rows for actions such as:

- `referral_created`
- `referral_updated`
- `visit_created`
- `visit_updated`
- `therapist_contacted`
- `therapist_ready_to_schedule`
- `therapist_scheduled`
- `therapist_visited_completed`
- `therapist_unable_to_reach`
- `therapist_needs_admin_help`

## No-PHI testing rules

- Use fake names such as `Demo Patient Alpha` or `Smoke Patient`.
- Use fake `+1555010....` phone numbers.
- Use `.test` or `example.test` email domains.
- Leave full address blank during seed/smoke testing.
- Keep notes generic, such as `Fake field pilot referral. No PHI.`
- Do not put diagnoses, treatment details, medical record numbers, dates of birth, insurance details, or emergency information into test rows.
- Do not test real SMS delivery from seed or smoke scripts.

## Therapist pilot workflow

1. Add 1-2 therapists to the `Therapist` table.
2. Keep `active=true` only for therapists currently participating.
3. Use `serviceAreaNotes` for simple operational notes such as cities, zip ranges, or availability boundaries.
4. Create a small number of `PatientReferral` records.
5. Assign each referral to one therapist with `assignedTherapistId`.
6. Create `Visit` rows when a visit is scheduled.
7. Keep visit notes operational and minimal. Do not put PHI in general notes unless a secure policy and access model are implemented.

## Operations UI

The field-pilot operations pages are environment-gated. In production, set:

```bash
FLOWVIA_PILOT_OPERATIONS_ENABLED=true
```

Start from login, then the dashboard:

```text
http://localhost:3000/login
http://localhost:3000/dashboard
```

The dashboard sidebar links to:

- Referral Operations -> `/admin/referrals`
- New Referral -> `/admin/referrals/new`
- Message Ledger -> `/admin/messages`
- My Work -> `/my-work`

The dashboard cards read from Prisma/Postgres and show:

- Open referrals count.
- Ready/scheduled referrals count.
- Active/completed count.
- Pending SMS consent count.
- Active therapist count.
- Recent audit activity count.

Open the admin referral list from the dashboard sidebar or quick action:

```text
http://localhost:3000/admin/referrals
```

Use `/admin/referrals` to review patient name, status, assigned therapist, city/ZIP, created date, and detail links. Full addresses are intentionally excluded from the list.

Create a referral manually:

```text
http://localhost:3000/admin/referrals/new
```

This creates a `PatientReferral` and an `AuditLog` row. It does not send SMS.

Open a referral detail page from the list to:

- Update referral status using the existing Prisma enum values.
- Assign or change therapist.
- Add or update operational notes.
- Create or update related visits.
- Review related audit events.

Full address storage is acknowledged but still not broadly displayed. Keep real PHI blocked until PHI policy, retention, backup, incident response, and final access-control review are complete.

## Admin referral workflow from dashboard

1. Run `pnpm db:seed` with `DATABASE_URL` pointing to Supabase/staging.
2. Log in as admin at `/login`.
3. Open `/dashboard`.
4. Confirm the sidebar shows Referral Operations, New Referral, Message Ledger, and My Work.
5. Click Referral Operations and confirm fake seeded referrals appear.
6. Click New Referral, create a fake referral, and confirm no SMS is sent.
7. Open the created referral detail page from the queue.
8. Change status, assign a therapist, create/update a visit, and confirm audit events appear.
9. Verify rows in Supabase Table Editor for `PatientReferral`, `Visit`, and `AuditLog`.

## Therapist demo worklist

After seeding fake data, open from the dashboard sidebar or directly:

```text
http://localhost:3000/my-work
```

Admin users can use `/my-work` for testing with a demo therapist selector:

- `Demo Therapist North Dallas`
- `Demo Therapist Plano/Frisco`

Therapist users do not see the selector. Their `/my-work` page is limited to the active `Therapist.email` row matching their login email. Seeded demo therapist emails are:

- `demo.north.dallas@flowviahealth.test`
- `demo.plano.frisco@flowviahealth.test`

The therapist worklist shows only referrals assigned to the selected or matched therapist. It supports safe pilot actions:

- Contacted -> sets referral status to `contacted`.
- Ready to schedule -> records a therapist audit/note and keeps an existing safe status.
- Scheduled -> sets referral status to `scheduled`.
- Visited / completed -> sets referral status to `completed`.
- Unable to reach -> records notes/audit without inventing enum values.
- Needs admin help -> records notes/audit without inventing enum values.

The therapist worklist does not show SMS internals and does not send SMS.

## Therapist workflow from dashboard

1. Run `pnpm db:seed`.
2. Log in as a therapist whose email matches a seeded or active `Therapist.email`.
3. Open `/dashboard`.
4. Click My Work in the dashboard sidebar.
5. Confirm only referrals assigned to that therapist appear.
6. Use Contacted, Ready to schedule, Scheduled, Visited / completed, Unable to reach, or Needs admin help.
7. Return to `/dashboard` and confirm the therapist dashboard updates.
8. Verify corresponding `PatientReferral` and `AuditLog` rows in Supabase Table Editor.

## SMS consent workflow

1. Patient submits `/sms-consent`.
2. App stores `SmsConsentEnrollment.status=pending_confirmation`.
3. App sends the approved confirmation SMS.
4. Patient replies `YES`.
5. Telnyx posts to `/api/telnyx/webhook`.
6. App stores the webhook, marks enrollment `active`, logs inbound/outbound messages, and sends the approved confirmation response.
7. Patient can reply `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, or `QUIT` to opt out.
8. Future transactional sends are blocked unless status is `active`.

## Telnyx inbound webhook testing

Local tunnel path:

1. Start the dev server for live SMS testing:

```bash
FLOWVIA_ALLOW_REAL_SMS_TEST=true pnpm dev
```

2. Start a public tunnel:

```bash
ngrok http 3000
```

3. In Telnyx Mission Control, set the `Flowvia_Messaging` inbound webhook URL to:

```text
https://<ngrok-domain>/api/telnyx/webhook
```

4. Set method to `POST`.
5. Submit `/sms-consent` with a test name and your own phone only.
6. Reply `YES`, `HELP`, and `STOP`.
7. Log in as admin and verify `/admin/messages` shows inbound replies, outbound auto-responses, delivery status events if present, and the final opted-out enrollment state.

Synthetic local route smoke path:

```bash
FLOWVIA_SMS_STORE_MODE=test FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true pnpm dev
pnpm telnyx:webhook-smoke
```

Normal browser/Postgres testing should not use `FLOWVIA_SMS_STORE_MODE=test`. Start the dev server with:

```bash
FLOWVIA_ALLOW_REAL_SMS_TEST=false pnpm dev
```

With `DATABASE_URL` configured, Message Ledger should show `Storage: Postgres`. `FLOWVIA_SMS_STORE_MODE=test` is only for synthetic route smokes and will make the ledger show the JSON test store.

`FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true` exists only for local synthetic smoke when a signing key is configured. It is ignored in production and must not be enabled on public deployments.

Vercel/public domain path:

1. Commit and deploy the latest code to Vercel.
2. Configure Vercel env vars:

```bash
DATABASE_URL=
DIRECT_URL=
TELNYX_API_KEY=
TELNYX_MESSAGING_PROFILE_ID=40019f0a-4f48-4749-9d5a-7bb4f0716cbe
TELNYX_FLOWVIA_FROM_NUMBER=+14692933948
TELNYX_WEBHOOK_SIGNING_SECRET=
FLOWVIA_ALLOW_REAL_SMS_TEST=true
FLOWVIA_ADMIN_EMAIL=
FLOWVIA_ADMIN_PASSWORD_HASH=
FLOWVIA_THERAPIST_EMAILS=
FLOWVIA_THERAPIST_PASSWORD_HASH=
FLOWVIA_SESSION_SECRET=
FLOWVIA_PILOT_OPERATIONS_ENABLED=true
FLOWVIA_ADMIN_MESSAGES_ENABLED=true
```

3. Set the Telnyx Messaging Profile inbound webhook URL to:

```text
https://flowviahealth.com/api/telnyx/webhook
```

4. Set method to `POST`.
5. Test `YES`, `HELP`, and `STOP`.
6. Turn `FLOWVIA_ALLOW_REAL_SMS_TEST=false` after controlled live SMS testing if no more real sends are needed.

Telnyx profile checklist:

- Messaging Suite -> Programmable Messaging -> Messaging Profiles -> `Flowvia_Messaging`.
- Confirm profile ID equals `40019f0a-4f48-4749-9d5a-7bb4f0716cbe`.
- Confirm number `+14692933948` is attached.
- Confirm the 10DLC campaign is active.
- Confirm inbound webhook URL is set.
- Confirm webhook method is `POST`.
- Confirm API key exists in local/Vercel env only and is not committed.
- Confirm profile API version is compatible with current v2 webhook payloads.

## Admin review

Use `/admin/messages` during the pilot to inspect:

- Storage mode: Postgres vs JSON fallback
- Telnyx configuration status without secrets
- Consent status
- Recent inbound/outbound SMS messages
- Delivery status
- Opt-outs

This page is read-only. It intentionally has no bulk messaging controls.

`/admin/messages` is reachable from the dashboard sidebar when `FLOWVIA_ADMIN_MESSAGES_ENABLED=true` in production. It remains gated separately from referral/worklist operations.

Therapist users cannot access `/admin/messages`.

## 1-2 therapist validation checklist

Before the first real patient:

- Confirm Postgres is being used in `/admin/messages`.
- Confirm `DATABASE_URL` is set in deployment.
- Confirm pilot auth env vars are set.
- Confirm unauthenticated `/dashboard`, `/admin/referrals`, and `/my-work` redirect to `/login`.
- Confirm admin can access `/admin/referrals` and `/admin/messages`.
- Confirm therapist can access `/my-work` and cannot access `/admin/messages`.
- Confirm Telnyx webhook signing is configured.
- Submit a test consent with an internal/test phone number.
- Reply `YES` and confirm status changes to `active`.
- Reply `HELP` and confirm the approved help response.
- Reply `STOP` and confirm status changes to `opted_out`.
- Confirm a normal transactional send is blocked after opt-out.
- Confirm no SMS body includes marketing copy or PHI.

During the first week:

- Start with one therapist.
- Keep referral volume intentionally low.
- Review opt-outs and failed delivery statuses daily.
- Manually reconcile visits against therapist feedback.
- Track gaps in workflow before adding automations.

## Remaining blockers before real field use

- Final enterprise authentication decision, such as managed IdP/SSO, MFA, password rotation, and account recovery.
- Final role/permission matrix beyond the pilot admin and therapist roles.
- PHI policy and access controls before storing sensitive clinical information.
- Backup, retention, and deletion policy for Postgres.
- Seed/import workflow for non-demo therapist roster.
- Formal runbook for incident response, webhook replay, and failed SMS follow-up.
