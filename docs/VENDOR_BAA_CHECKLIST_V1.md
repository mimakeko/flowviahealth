# Vendor BAA Checklist V1

Purpose: track vendor agreement and regulated-data readiness before Flowvia handles PHI or real patients.

This checklist is not a legal certification. It is a production/PHI blocker list for legal, compliance, operations, and engineering review.

## Current Boundary

- Fake data only.
- Personal phone only for controlled SMS tests.
- No PHI.
- No real patients.
- No clinical notes in operational fields.
- No PHI in SMS.
- AI remains disabled/mock-only and no-PHI.

## Vendors

| Vendor / Surface | Current Use | PHI Risk If Enabled | BAA / Contract Review | Status | Production PHI Blocker |
| --- | --- | --- | --- | --- | --- |
| Supabase / Postgres | Stores pilot referrals, visits, SMS consent, ledger, audit records. | High if real patients/PHI are stored. | Confirm BAA availability, data region, backups, retention, access controls, audit export, breach support. | Open | Yes |
| Vercel | Hosts public app, dashboard, API routes, webhook endpoint. | High if PHI enters app routes/logs. | Confirm BAA availability, logging controls, env secret handling, access control, incident process. | Open | Yes |
| Telnyx | SMS transport and inbound webhook provider. | High if PHI is sent by SMS. | Confirm appropriate messaging agreement/BAA posture, 10DLC scope, webhook signing, keyword behavior, retention. | Open | Yes |
| Resend | Optional email delivery for public contact/notifications. | Medium/high if email includes PHI. | Confirm BAA posture before PHI email, sender verification, retention/log controls. | Optional/Open | Yes if PHI email is planned |
| OpenAI / AI provider | Not wired for real calls; mock-only assistant. | High if PHI is sent to an AI provider. | Do not enable with PHI until BAA, zero-retention/data controls, audit, consent, and no-PHI routing are approved. | Disabled | Yes |
| GitHub / developer tooling | Source control and issue/PR workflow. | High if secrets/PHI are pasted into source/issues/logs. | Confirm org access, secret scanning, incident process, no-PHI development policy. | Open | Yes |

## Approval Evidence To Collect

- Executed BAA or documented legal determination for each PHI-touching vendor.
- Data processing location and subprocessors.
- Retention/deletion terms.
- Backup/restore guarantees.
- Security incident notification process.
- Access controls and audit logs.
- Support-data handling rules.
- Confirmation that app logs, build logs, analytics, and observability tools do not capture PHI.

## Engineering Gates Before PHI

- `FLOWVIA_DATA_MODE=phi_blocked` remains enforced until approval.
- `FLOWVIA_ALLOW_REAL_SMS_TEST=false` by default.
- SMS templates remain transactional and no-PHI.
- Operational notes continue to block clinical/PHI-like content.
- Secure clinical note workflow is not enabled.
- AI real-provider mode remains disabled unless explicitly approved for no-PHI or covered PHI use.
- Temporary passwords are rotated.
- MFA/final auth and access review are complete.
- Backup/restore, retention/deletion, incident response, and audit review are documented and tested.
