# Production Readiness Blockers V1

Flowvia is not approved for real patients or PHI yet. This list blocks production clinical use until each item is resolved and reviewed.

Flowvia's production direction is a therapist-first operational intelligence layer around existing EMRs, not an EMR replacement. Billing, claims, Medicare/OASIS, regulatory documentation, and official charting workflows remain out of scope unless a future approved product/security/legal review changes that boundary.

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
- Scheduling Intelligence V1 must remain deterministic: next-5-business-day windows only, no external maps/geocoding APIs, no real travel-time calculation, no autonomous scheduling, no PHI, human review required, and create-visit requires a passing deterministic ready gate.
- Referral Intake Quality, Duplicate Guard, and the referral detail decision workspace must remain deterministic/local-data-only and warning-only: no external duplicate APIs, no external AI, no therapist auto-assignment, no automatic visit creation, no SMS sending, no full phone display, no full-address display, no raw blocked note storage, no raw SMS bodies, no provider payloads, no secrets, no raw Prisma/framework errors, and human review required before scheduling. Duplicate-review, opted-out/non-SMS, missing intake, missing therapist, terminal, archived, and explicit smoke/test referrals must be review-only for visit creation.
- Therapist Field Visit Workflow must remain fake/test-data-only and manual-only: assigned visit start/complete/no-show/cancel actions only, no autonomous status changes, no SMS sending, no full-address exposure, no PHI, and no clinical documentation.
- Therapist phone/iPad workspace readiness is pilot-only: responsive layout, empty states, query minimization, and safe banners may improve usability, but they do not approve PHI, clinical documentation, autonomous actions, SMS sending, maps/geocoding, or external API use.
- Therapist Opportunity Acceptance must remain fake/demo-data-only, deterministic, and manual-only: admins may offer safe assigned referrals, therapists may manually accept or decline with fixed safe reasons, accepted demo opportunities may unlock Create visit only after the existing ready gate passes, and no SMS, auto-assignment, auto-acceptance, auto visit creation, AI, maps/geocoding, travel-time, EMR, billing, claims, OASIS, or clinical documentation behavior is approved.
- Backup/restore policy and tested restore process are needed.
- Retention/deletion policy is needed.
- Incident response policy is needed.
- Duplicate HELP response source must be resolved before production.
- Real SMS template approval is needed.
- PHI in SMS forbidden.
- Field pilot referral/visit workflows are fake-data-only until production auth, audit review, retention, backup, incident response, and vendor controls are complete.
- Operational notes must not include diagnosis, treatment details, clinical notes, emergency notes, medication, symptoms, therapy plans, wound details, or pain scores.
- Cloud pilot health checks must remain green: `/admin/health`, `/admin/messages`, `/admin/audit`, `/admin/data`, no Vercel 500s, no `EMAXCONNSESSION`, no TLS/certificate errors, Real SMS gate Off except controlled personal-phone tests, and data mode `personal_test` or `phi_blocked`.
- Data stewardship is fake-data-only: no audit deletion, no SMS history deletion, archive over delete, archived/smoke operational rows hidden from active workflow queues, and personal-number tests end `opted_out` unless active testing is underway.
- Pilot data reset/demo scenario tools are fake-data-only and admin-only: exact confirmation phrases required, archive-first cleanup for fake/demo and smoke/test operational records, no hard delete of audit/SMS/webhook/consent history, no real data reset, no SMS sending, no external reset APIs, and no maps/geocoding/travel-time APIs.
- Authenticated browser smoke is local-only in this pass: it must refuse production/staging domains, skip safely without local credentials, remain read-only except login/logout cookies, and never click destructive Data Stewardship actions, SMS controls, referral/visit submit buttons, or therapist status-change submits.
- Browser smoke screenshots and traces are local artifacts only and must not be committed or used as proof of PHI readiness.
- Guided visit creation remains pilot-only and manual-only: ready-gate enforcement, required referral/therapist/datetime fields, blocked-create audit, no SMS, no external AI/API, no maps/geocoding/travel-time, no auto-assignment, and no auto visit creation must all remain in force.

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
- Confirm `/my-work` shows the Next field action near the top on phone/iPad, assigned field visits before referrals in Today, Upcoming, and Completed recently sections, no horizontal overflow, inline confirmation before every therapist visit status write, safe success/error banners, and terminal visits warn and block further therapist field updates.
- Confirm `/my-work` shows calm empty states for no visits today, no upcoming visits assigned, no recent field completions, and no assigned referrals needing action; loading/error states must not expose stack traces, database internals, raw SMS bodies, full phones, provider payloads, or PHI.
- Open `/admin/visits/[id]` and confirm Current field state and Therapist field activity show safe metadata only, including blocked-note/future-completion warnings without raw note bodies.
- Open `/admin/audit` and review recent audit events and filters for therapist field actions, blocked notes, visit status changes, and future completion warnings; no secrets, raw SMS bodies, provider payloads, full phones, note bodies, or PHI should appear.
- Open `/admin/data` and confirm stewardship status is audit-preserving, no SMS history deletion is offered, and real SMS gate remains Off.
- Confirm `/admin/health` shows Operations Assistant V2 as mock/deterministic, external API calls disabled, no-PHI mode on, and autonomous actions disabled.
- Confirm `/admin/health` shows Scheduling Intelligence enabled, source deterministic, business-day-only windows, external APIs/maps/geocoding/travel-time/external AI disabled, autonomous scheduling disabled, and no-PHI mode on.
- Confirm `/admin/health` shows Referral Intake Quality enabled, referral detail decision workspace enabled, referral detail create CTA gate enabled, referral detail review-only blocks enabled, referral detail safety guarantees enabled, scheduling ready gate enabled, create-visit gate source deterministic referral intake quality, duplicate/non-SMS/intake-review create-visit blocks enabled, manual override disabled, duplicate guard warning-only, duplicate source deterministic/local data, auto-assignment disabled, auto visit creation disabled, intake PHI storage disabled, external duplicate APIs disabled, SMS sending from intake disabled, and full phone display disabled/masked.
- Confirm `/admin/health` shows field workspace optimized, empty states, mobile overflow guard, query minimization, confirmation UX, therapist field confirmations, mobile action UX, blocked note safe feedback, and field activity audit enabled; no SMS controls, no external APIs, no autonomous actions, PHI note storage disabled, and SMS sending disabled.
- Confirm `/admin/health` shows Therapist Field Visit Workflow enabled, phone/iPad layout enabled, manual-only, no-PHI mode on, no-PHI notes enforced, terminal visit lock enabled, SMS sending disabled, external APIs disabled, and autonomous status changes disabled.
- Confirm `/admin/health` shows Therapist opportunity workflow enabled, opportunity source deterministic/manual, auto-assignment disabled, auto-acceptance disabled, SMS from opportunity workflow disabled, external matching APIs disabled, maps/geocoding/travel-time APIs disabled, AI opportunity decisions disabled, manual accept/decline enabled, and safe audit enabled.
- Confirm `/admin/referrals/[id]` shows the Therapist opportunity panel, `/admin/scheduling` separates accepted ready rows from ready rows awaiting therapist acceptance, and `/my-work` shows only opportunities offered to the selected/logged-in therapist.
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
- Therapist field workspace performance improvements must keep using the existing Prisma wrapper, explicit selected fields, safe redacted rendering, and no raw SMS body selection for workspace rendering.
- Therapist field notes must be operational-only and blocked before write when note classification detects PHI-like, SMS-forbidden, diagnosis, treatment, medication, symptoms, measurements, or clinical-note content.
- Therapist opportunity decline notes must be optional, no-PHI, classification-checked, and never stored or displayed as raw clinical detail; decline reasons must stay on the fixed safe enum.
- Therapist opportunity accept/decline must remain therapist-scoped to the exact offered therapist and must not trigger SMS, reassignment, visit creation, scheduling automation, or external matching.
- SMS send actions are blocked from referral/visit workflow pages.
- Audit trail metadata must remain summarized and safe; do not expose raw SMS payloads, provider payloads, secrets, or PHI.
- Data stewardship tools must not hard-delete audit logs or SMS history and must require exact confirmation for archive/cleanup actions. Archived records remain queryable through database/audit history while active workflow queues hide them. Action result banners must not expose `NEXT_REDIRECT`, stack traces, Prisma errors, secrets, provider payloads, raw SMS bodies, or full phone numbers.
- Demo reset tools must not reset real-looking records, hard-delete protected history, send SMS, create external API calls, or bypass RBAC. `ARCHIVE SMOKE TEST DATA` and `RESET DEMO SCENARIOS` remain exact confirmation gates, and normal workflow queues must exclude explicit smoke/test operational records by default.
- Browser smoke must continue to assert that the therapist workspace, referral decision/readiness flow, scheduling intelligence, data stewardship, health, and audit guardrails exist without adding EMR, billing, claims, Medicare/OASIS, regulatory documentation, or official charting scope.
- Assistant suggestions must remain operational-only and human-reviewed; do not enable real provider mode or autonomous actions before production controls are approved.
- Scheduling suggestions must remain operational-only and human-reviewed. `Use this window` may fill a datetime field only; do not enable route optimization, maps/geocoding APIs, travel-time calculation, autonomous visit creation, SMS sending, ready-gate override, or submit bypass before production controls are approved.
- Referral detail decisions and duplicate warnings must remain operational-only and human-reviewed. Do not enable external duplicate search, automatic merging, therapist auto-assignment, automatic visit creation, SMS sending, full-phone display, full-address display, raw SMS/body/provider-payload exposure, or PHI storage before production controls are approved.
- Visit creation from ready referrals must remain operational-only and human-reviewed. `Use this window` may fill `scheduledAt` only; do not enable submit bypass, ready-gate override, autonomous scheduling, SMS sending, external map/travel APIs, clinical documentation, billing, claims, OASIS, or Medicare workflows.
- Opportunity workflow demos may block `Create visit` until therapist acceptance is recorded; do not weaken the existing ready gate, remove review-only blockers, or imply therapist acceptance before the safe audit event exists.
- Full phone number exposure must remain limited and masked by default.
