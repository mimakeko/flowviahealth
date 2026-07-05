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
- Backup/restore policy and tested restore process are needed.
- Retention/deletion policy is needed.
- Incident response policy is needed.
- Duplicate HELP response source must be resolved before production.
- Real SMS template approval is needed.
- PHI in SMS forbidden.
- Field pilot referral/visit workflows are fake-data-only until production auth, audit review, retention, backup, incident response, and vendor controls are complete.
- Operational notes must not include diagnosis, treatment details, clinical notes, emergency notes, medication, symptoms, therapy plans, wound details, or pain scores.

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

## Workflow-Specific Blockers

- Real patient referrals are blocked.
- Real visit schedules are blocked.
- Therapist workflow actions are pilot-only and not final clinical documentation.
- SMS send actions are blocked from referral/visit workflow pages.
- Full phone number exposure must remain limited and masked by default.
