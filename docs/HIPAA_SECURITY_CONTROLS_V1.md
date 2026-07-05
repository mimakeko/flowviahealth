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
- Data stewardship: fake/personal-number pilot cleanup must preserve audit history, preserve SMS consent/message/webhook history, and archive operational records instead of deleting audit evidence.
- Transmission security: require HTTPS, signed Telnyx webhooks, secure database connections, and secret-managed API keys.
- Encryption: use managed encrypted storage and avoid secrets in source, screenshots, logs, and tickets.
- Integrity controls: validate webhook signatures, preserve event-id idempotency, and reject unsupported data modes.
- AI controls: Operations Assistant V2 is deterministic/mock-only, no external API calls, no autonomous actions, no clinical guidance, and human review required.
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
- Operations Assistant cards use safe workflow state only and must not include PHI, clinical advice, diagnosis, or treatment guidance.
