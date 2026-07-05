# Flowvia Today Snapshot - 2026-07-02

## Live-Tested Successfully

- Admin login.
- Therapist login.
- Admin/therapist RBAC.
- Supabase/Postgres through Prisma.
- SMS consent route.
- Outbound Telnyx SMS to owner personal phone.
- Inbound Telnyx webhook through ngrok.
- Inbound `YES`.
- Inbound `HELP`.
- Inbound `STOP`.
- Message Ledger.

## Test Data Boundary

- Owner personal phone only.
- Fake/non-PHI data only.
- No real patients.
- No clinical production data.

## Must Remain Blocked

- Real patients.
- PHI.
- Clinical notes.
- Diagnoses.
- Treatment details in SMS.

## Current Telnyx Values

- Messaging Profile ID: `40019f0a-4f48-4749-9d5a-7bb4f0716cbe`
- From number: `+14692933948`

## Known Issue

`HELP` produced duplicate responses during live local testing. The likely cause is Telnyx Keyword Management auto-response plus the Flowvia app response. Flowvia should be the single source of truth for keyword handling, consent state, ledger rows, and audit.

## Tomorrow Target

`FLOWVIA_CLOUD_STAGING_ALWAYS_ON_PILOT_V1`

## Field Pilot Operations Workflow Added

- Admin dashboard now tracks referral status counts, visit counts, SMS consent status, recent audit activity, recent referral activity, and SMS activity summary.
- Therapist dashboard now shows scoped assigned referrals, ready-to-schedule count, upcoming visits, needs-contact count, and recent assigned activity.
- Admin referral workflow supports fake referral creation, status update, therapist assignment, operational notes, visit creation, audit trail, masked phone display, and SMS readiness indicators.
- Admin visit workflow lives inside `/admin/visits`, `/admin/visits/new`, and `/admin/visits/[id]`.
- Therapist `/my-work` shows assigned referrals and visits, with visit actions for `in_progress`, `completed`, and `no_show`.
- SMS remains readiness-only in referral/visit workflow pages; no real SMS send button was added.
- All workflow data remains fake/no-PHI/personal-test boundary only.
