# Production Readiness Blockers V1

Flowvia is not approved for real patients or PHI yet. This list blocks production clinical use until each item is resolved and reviewed.

## Current Blockers

- No real patients/PHI yet.
- Temporary pilot passwords must be rotated.
- Final auth, MFA, account recovery, and password reset are needed.
- Per-user accounts, user lifecycle management, user deactivation, and access review are needed.
- Session timeout policy needs final review.
- Login failure audit and routine audit review are needed.
- Webhook signing secret must be enforced.
- Unsigned webhook bypass is forbidden outside local dev.
- Vendor BAA review is required before PHI for Supabase, Vercel, Telnyx, Resend if email is used, and any AI/dev tooling if PHI might be involved later.
- AI real-provider mode must remain disabled/mock-only until no-PHI routing, audit-only controls, legal/vendor review, and explicit approval are complete.
- Operations Assistant V2 must remain deterministic/mock-only: no external AI/API calls, no autonomous actions, no clinical advice, no diagnosis/treatment guidance, and no PHI in inputs or outputs.
- Scheduling Intelligence V1 must remain deterministic: next-5-business-day windows only, no external maps/geocoding APIs, no real travel-time calculation, no autonomous scheduling, no PHI, and human review required.
- Therapist Field Visit Workflow must remain fake/test-data-only and manual-only: assigned visit start/complete/no-show/cancel actions only, no autonomous status changes, no SMS sending, no full-address exposure, no PHI, and no clinical documentation.
- Therapist phone/iPad workspace readiness is pilot-only: responsive layout may improve usability, but it does not approve PHI, clinical documentation, autonomous actions, SMS sending, maps/geocoding, or external API use.
- Backup/restore policy and tested restore process are needed.
- Retention/deletion policy is needed.
- Incident response policy is needed.
- Duplicate HELP response source must be resolved before production.
- Real SMS template approval is needed.
- PHI in SMS forbidden.
- Field pilot referral/visit workflows are fake-data-only until production auth, audit review, retention, backup, incident response, and vendor controls are complete.
- Operational notes must not include diagnosis, treatment details, clinical notes, emergency notes, medication, symptoms, therapy plans, wound details, or pain scores.
- Cloud pilot health checks must remain green: `/admin/health`, `/admin/messages`, `/admin/audit`, `/admin/data`, no Vercel 500s, no `EMAXCONNSESSION`, no TLS/certificate errors, Real SMS gate Off except controlled personal-phone tests, and data mode `personal_test` or `phi_blocked`.
- Data stewardship is fake-data-only: no audit deletion, no SMS history deletion, archive over delete, and personal-number tests end `opted_out` unless active testing is underway.

## Required Auth Improvements

- MFA.
- Password reset.
- Account recovery.
- Session timeout.
- Per-user accounts.
- User deactivation.
- Login failure audit.

## Production Rule

`FLOWVIA_DATA_MODE=phi_blocked` remains required. `phi_allowed` is a future mode and must not be enabled until legal, operational, vendor, security, backup, retention, incident response, and audit controls are complete.

## Cloud Pilot Daily Check

Before any serious pilot use, an admin should:

- Open `/admin/health` and confirm deploy target, database pooler modes, webhook signing, Telnyx config, SMS store mode, AI mock/no-PHI state, and recent activity timestamps.
- Open `/admin/messages` and confirm Cloud webhook last seen, latest inbound keyword, masked phone values, consent state, and recent webhook events.
- Open `/admin/referrals` and `/admin/visits` to confirm fake-data workflow queues are moving through assignment, scheduling, active, completed, canceled, no-show states as expected.
- Have therapists review `/my-work`; therapist actions must remain scoped to their assigned referrals/visits and limited to operational status/note updates.
- Confirm `/my-work` shows the Next field action near the top on phone/iPad, assigned field visits before referrals in Today, Upcoming, and Completed recently sections, no horizontal overflow, and terminal visits warn and block further therapist field updates.
- Open `/admin/audit` and review recent audit events for safe metadata only; no secrets, raw SMS bodies, provider payloads, or PHI should appear.
- Open `/admin/data` and confirm stewardship status is audit-preserving, no SMS history deletion is offered, and real SMS gate remains Off.
- Confirm `/admin/health` shows Operations Assistant V2 as mock/deterministic, external API calls disabled, no-PHI mode on, and autonomous actions disabled.
- Confirm `/admin/health` shows Scheduling Intelligence enabled, source deterministic, business-day-only windows, external APIs/maps/geocoding/travel-time/external AI disabled, autonomous scheduling disabled, and no-PHI mode on.
- Confirm `/admin/health` shows Therapist Field Visit Workflow enabled, phone/iPad layout enabled, manual-only, no-PHI mode on, no-PHI notes enforced, terminal visit lock enabled, SMS sending disabled, external APIs disabled, and autonomous status changes disabled.
- Confirm Real SMS gate is Off except during an explicit controlled personal-phone test window.
- Confirm Vercel logs show no 500s and no `EMAXCONNSESSION`.
- Confirm no TLS/certificate errors.
- Confirm data mode remains `personal_test` or `phi_blocked`; PHI remains blocked.

## Workflow-Specific Blockers

- Real patient referrals are blocked.
- Real visit schedules are blocked.
- Therapist workflow actions are pilot-only and not final clinical documentation.
- Therapist field visit actions must remain assigned-only and deterministic: scheduled to in-progress, scheduled/in-progress to completed, scheduled/in-progress to no-show, or scheduled/in-progress to canceled.
- Therapist phone/iPad workspace improvements must remain UI-only: no new standalone app, no push notifications, no PWA install flow, no autonomous scheduling, no autonomous status changes, no SMS send controls, and no external maps/geocoding/travel-time APIs.
- Therapist field notes must be operational-only and blocked before write when note classification detects PHI-like, SMS-forbidden, diagnosis, treatment, medication, symptoms, measurements, or clinical-note content.
- SMS send actions are blocked from referral/visit workflow pages.
- Audit trail metadata must remain summarized and safe; do not expose raw SMS payloads, provider payloads, secrets, or PHI.
- Data stewardship tools must not hard-delete audit logs or SMS history and must require exact confirmation for archive/cleanup actions.
- Assistant suggestions must remain operational-only and human-reviewed; do not enable real provider mode or autonomous actions before production controls are approved.
- Scheduling suggestions must remain operational-only and human-reviewed. `Use this window` may fill a datetime field only; do not enable route optimization, maps/geocoding APIs, travel-time calculation, autonomous visit creation, SMS sending, or submit bypass before production controls are approved.
- Full phone number exposure must remain limited and masked by default.
