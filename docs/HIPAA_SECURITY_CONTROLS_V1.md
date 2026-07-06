# HIPAA Security Controls V1

This is a readiness/control framework for Flowvia Health. It is not a legal certification and does not by itself authorize PHI or real patient use.

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
- Referral intake controls: referral intake quality and duplicate guard are deterministic/local-data-only, warning-only, no-PHI, no external duplicate APIs, no external AI, no therapist auto-assignment, no automatic visit creation, no SMS sending, masked phone display, safe audit metadata only, and human review required before scheduling. The create-visit ready gate blocks duplicate-review, opted-out/non-SMS, missing intake, missing therapist, terminal, archived, and explicit smoke/test referrals.
- Scheduling controls: Scheduling Intelligence V1 is deterministic only, with next-5-business-day suggestions, external maps/geocoding, route optimization, real travel-time calculation, external AI, SMS sending, and autonomous scheduling disabled. Manual create-visit override is disabled for referrals that fail the deterministic gate.
- Therapist field workflow controls: `/my-work` is assigned-scope only, manual-only, confirmation-gated before visit status writes, fake/test-data-only, no-PHI, no SMS sending, no external AI/APIs, no maps/geocoding/travel-time APIs, and no autonomous status changes.
- Therapist phone/iPad workspace controls: responsive field usability, calm empty states, safe loading/error states, query minimization, and transient action banners must preserve masking, no-PHI note blocking, terminal visit locks, manual submit requirements, RBAC, deterministic assistant/scheduling context, and no external API/SMS/map/travel surfaces.
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
- Data Stewardship tools are admin-only, confirmation-gated, fake-data-only, audit-preserving, and do not send SMS.
- Data reset/demo scenario tools use `ARCHIVE SMOKE TEST DATA` and `RESET DEMO SCENARIOS` exact confirmation phrases, preserve audit/SMS/webhook/consent history, hide archived and explicit smoke/test operational rows from normal work queues, keep protected history queryable, and keep hard delete mode, real data reset, external reset APIs, SMS sending, maps/geocoding, and travel-time APIs disabled.
- Operations Assistant cards use safe workflow state only and must not include PHI, clinical advice, diagnosis, or treatment guidance.
- Referral intake quality uses safe operational fields only and must not include PHI, clinical advice, diagnosis, treatment guidance, full phone exposure, raw blocked note text, raw SMS bodies, provider payloads, secrets, external duplicate APIs, SMS sending, autonomous therapist assignment, or autonomous visit creation. Failed create-visit gate attempts write safe metadata only.
- Scheduling Intelligence uses fake pilot city/ZIP/service-area/status/time data only and must not include PHI, full street addresses, clinical guidance, raw SMS bodies, or secrets. `Use this window` fills a form field only and must not create visits without manual human submit and a passing deterministic ready gate.
- Therapist field visit notes are operational-only and must be rejected before persistence when note classification detects PHI-like, SMS-forbidden, diagnosis, treatment, medication, symptoms, measurements, or clinical-note content.
- Therapist field blocked-note feedback must show only safe reason, destination, optional safe rewrite, and operational examples; raw blocked note text must not be stored or displayed.
- Therapist field visit audit events must store safe metadata only: visit/referral identifiers, old/new status, attempted action, blocked reason/category counts, warning flags, and no raw unsafe note body, full phone, full address, secrets, SMS provider payload, diagnosis, or treatment details.
- `/my-work` phone/iPad layouts must keep the Next field action, no-PHI guidance, masked phone values, inline confirmation, safe success/error banners, and terminal visit warning close to the manual action controls.
- `/my-work` empty/loading/error states must be operational-only and must not expose stack traces, database URLs, internal ids, full phone numbers, raw SMS bodies, secrets, provider payloads, clinical detail, or PHI.
- `/my-work` data loading must keep using the existing Prisma wrapper and explicit selected fields; workspace rendering must not select or expose raw SMS bodies.
- `/admin/visits/[id]`, `/admin/audit`, and `/admin/health` must expose therapist field state and controls through safe metadata/flags only, with autonomous field actions, external AI/API for field notes, PHI note storage, and SMS sending disabled.
