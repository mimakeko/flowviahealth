# HIPAA Security Controls V1

This is a readiness/control framework for Flowvia Health. It is not a legal certification and does not by itself authorize PHI or real patient use.

Flowvia's approved pilot scope is a therapist-first operational intelligence layer around existing EMRs. EMR replacement, billing, claims, Medicare/OASIS, regulatory documentation, and official charting workflows are outside scope.

## Administrative Safeguards

- Risk analysis: maintain `docs/HIPAA_RISK_REGISTER_V1.md` and review before any PHI use.
- Risk management: keep production blockers in `docs/PRODUCTION_READINESS_BLOCKERS_V1.md` and fail closed on PHI.
- Access management: use unique accounts, RBAC, least privilege, user deactivation, and periodic access review.
- Incident response: define reporting, triage, containment, notification, and post-incident review procedures.
- Workforce/user policy placeholder: document acceptable use, no-PHI local dev, password handling, device locking, and support escalation.

## Technical Safeguards

- Unique user identification: replace temporary shared pilot credentials with per-user accounts.
- RBAC: admins and therapists must keep separate route and data access.
- Audit controls: retain login, referral, SMS consent, webhook, and operational audit events.
- Data stewardship: fake/personal-number pilot cleanup must preserve audit history, preserve SMS consent/message/webhook history, archive operational records instead of deleting audit evidence, and hide archived/smoke operational rows from active workflow queues.
- Demo reset controls: pilot reset/demo scenario tools are admin-only, exact-confirmation-gated, fake-data-only, archive-first for fake/demo and smoke/test operational records, no hard-delete for protected history, no real data reset, no SMS sending, no full phone exposure, no raw SMS bodies, no provider payloads, no external AI/APIs, and no maps/geocoding/travel-time APIs.
- Transmission security: require HTTPS, signed Telnyx webhooks, secure database connections, and secret-managed API keys.
- Encryption: use managed encrypted storage and avoid secrets in source, screenshots, logs, and tickets.
- Integrity controls: validate webhook signatures, preserve event-id idempotency, and reject unsupported data modes.
- AI controls: Operations Assistant V2 is deterministic/mock-only, no external API calls, no autonomous actions, no clinical guidance, and human review required.
- Referral intake controls: referral intake quality and duplicate guard are deterministic/local-data-only, warning-only, no-PHI, no external duplicate APIs, no external AI, no therapist auto-assignment, no automatic visit creation, no SMS sending, masked phone display, safe audit metadata only, and human review required before scheduling. The referral detail decision workspace and create-visit ready gate block duplicate-review, opted-out/non-SMS, missing intake, missing therapist, terminal, archived, and explicit smoke/test referrals.
- Guided visit creation controls: `/admin/visits/new?referralId=...` may preselect a ready referral and assigned therapist, show deterministic business-day windows, and route successful manual submit to visit detail. It must require manual submit, enforce the ready gate server-side, audit blocked submit attempts as `visit_create_blocked`, store safe audit metadata only, and keep SMS sending, maps/geocoding/travel-time APIs, external AI/API calls, auto-assignment, and automatic visit creation disabled.
- Therapist opportunity controls: opportunity state is deterministic and audit-derived from safe events only. Admin offer, therapist accept, and therapist decline remain fake/demo-data, manual-only, therapist-scoped, no-PHI, no-SMS, no auto-assignment, no auto-acceptance, no auto-visit-creation, no external AI/API, no matching API, and no maps/geocoding/travel-time workflow. Declines require a fixed safe reason and optional no-PHI note classification before write.
- Scheduling controls: Scheduling Intelligence V1 is deterministic only, with next-5-business-day suggestions, external maps/geocoding, route optimization, real travel-time calculation, external AI, SMS sending, and autonomous scheduling disabled. Manual create-visit override is disabled for referrals that fail the deterministic gate.
- Therapist field workflow controls: `/my-work` is assigned-scope only, manual-only, confirmation-gated before visit status writes, fake/test-data-only, no-PHI, no SMS sending, no external AI/APIs, no maps/geocoding/travel-time APIs, and no autonomous status changes.
- Therapist phone/iPad workspace controls: responsive field usability, calm empty states, safe loading/error states, query minimization, and transient action banners must preserve masking, no-PHI note blocking, terminal visit locks, manual submit requirements, RBAC, deterministic assistant/scheduling context, and no external API/SMS/map/travel surfaces.
- Authenticated browser smoke controls: `pnpm browser:auth-smoke` is local-only, read-only except for login/logout cookies, refuses non-local base URLs, skips safely when local credentials are missing, saves local screenshots only under `artifacts/browser-smoke/`, and must not click destructive Data Stewardship controls, SMS controls, referral/visit submit buttons, or therapist status-change submit buttons.
- Session management: signed httpOnly cookies are acceptable for pilot only; final timeout, revocation, and recovery controls remain blockers.

## Physical Safeguards

- Local dev device handling: do not store PHI locally; use fake data and personal-number-only tests.
- Laptop sleep/lock: local testing is allowed only while supervised; stop ngrok and real SMS mode when done.
- No PHI in local dev.
- Production access policy: limit production dashboard and database access to approved operators only.

## Current Guardrails

- Dashboard banner: pilot mode, fake data, personal-number testing only, no PHI.
- `FLOWVIA_DATA_MODE=phi_blocked` by default.
- `FLOWVIA_ALLOW_REAL_SMS_TEST=false` by default.
- `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=false` by default.
- Message Ledger masks phone numbers and does not expose secrets.
- Data Stewardship tools are admin-only, confirmation-gated, fake-data-only, audit-preserving, render fixed safe action-result banners only, and do not send SMS.
- Data reset/demo scenario tools use `ARCHIVE SMOKE TEST DATA` and `RESET DEMO SCENARIOS` exact confirmation phrases, preserve audit/SMS/webhook/consent history, hide archived and explicit smoke/test operational rows from normal work queues, keep protected history queryable, and keep hard delete mode, real data reset, external reset APIs, SMS sending, maps/geocoding, and travel-time APIs disabled.
- Operations Assistant cards use safe workflow state only and must not include PHI, clinical advice, diagnosis, or treatment guidance.
- Referral intake quality and the referral detail decision workspace use safe operational fields only and must not include PHI, clinical advice, diagnosis, treatment guidance, full phone exposure, full address display, raw blocked note text, raw SMS bodies, provider payloads, secrets, stack traces, raw Prisma errors, `NEXT_REDIRECT`, external duplicate APIs, SMS sending, autonomous therapist assignment, or autonomous visit creation. Failed create-visit gate attempts write safe metadata only.
- Scheduling Intelligence uses fake pilot city/ZIP/service-area/status/time data only and must not include PHI, full street addresses, clinical guidance, raw SMS bodies, or secrets. `Use this window` fills a form field only and must not create visits without manual human submit and a passing deterministic ready gate.
- Therapist opportunity cards use fake display name, city/ZIP, service area/workflow type, status, and deterministic readiness only. They must not display full phone, full address, diagnosis, treatment detail, raw SMS, provider payloads, secrets, PHI, or unsafe free-form notes.
- Therapist opportunity audit events must store safe metadata only: therapist/referral identifiers, source, fixed decline reason, note-added flag, attempted action, and blocked reason. Raw decline note bodies, full phone numbers, full addresses, raw SMS bodies, provider payloads, secrets, and clinical detail must not be stored in opportunity audit metadata.
- Opportunity-aware scheduling must show `Create visit` only when the existing ready gate passes and the applicable opportunity state is accepted; offered, declined, not-offered demo rows, and blocked referrals remain review-only or awaiting acceptance.
- Therapist field visit notes are operational-only and must be rejected before persistence when note classification detects PHI-like, SMS-forbidden, diagnosis, treatment, medication, symptoms, measurements, or clinical-note content.
- Therapist field blocked-note feedback must show only safe reason, destination, optional safe rewrite, and operational examples; raw blocked note text must not be stored or displayed.
- Therapist field visit audit events must store safe metadata only: visit/referral identifiers, old/new status, attempted action, blocked reason/category counts, warning flags, and no raw unsafe note body, full phone, full address, secrets, SMS provider payload, diagnosis, or treatment details.
- `/my-work` phone/iPad layouts must keep the Next field action, no-PHI guidance, masked phone values, inline confirmation, safe success/error banners, and terminal visit warning close to the manual action controls.
- `/my-work` empty/loading/error states must be operational-only and must not expose stack traces, database URLs, internal ids, full phone numbers, raw SMS bodies, secrets, provider payloads, clinical detail, or PHI.
- `/my-work` data loading must keep using the existing Prisma wrapper and explicit selected fields; workspace rendering must not select or expose raw SMS bodies.
- `/admin/visits/[id]`, `/admin/audit`, and `/admin/health` must expose therapist field state and controls through safe metadata/flags only, with autonomous field actions, external AI/API for field notes, PHI note storage, and SMS sending disabled.
- Browser smoke screenshots and traces must remain local artifacts, not committed evidence, and must not contain full phone numbers, raw SMS bodies, provider payloads, stack traces, database URLs, secrets, PHI, or EMR/billing/OASIS/claims workflow surfaces.
- Guided visit creation browser smoke is local-only and read-only by default: it may click ready navigation links and `Use this window` fill-only buttons, but must not click submit, send SMS, reset/archive data, or test authenticated production routes.
- Opportunity workflow browser smoke is local-only and read-only: it may view opportunity badges, the referral detail opportunity panel, scheduling accepted/awaiting lanes, Health Center cards, and optional therapist `/my-work` opportunity cards, but must not click offer, accept, decline, create-visit submit, SMS, reset, archive, or production authenticated routes.
