# Vercel Env Manifest V1

Purpose: exact environment-variable manifest for always-on Flowvia cloud staging on Vercel.

Boundary: fake data only, owner/personal-number-only SMS testing, no PHI, no real patients. Do not paste secrets into source, docs, tickets, screenshots, or chat logs.

## Deployment Target

| Variable | Purpose | Required for staging | Safe example | Secret handling | Missing readiness behavior | Can remain disabled |
| --- | --- | --- | --- | --- | --- | --- |
| `FLOWVIA_DEPLOY_TARGET` | Declares runtime target for readiness checks and status panels. | Yes | `staging` | Public-safe. | Fail in staging/production-like checks if absent or unsupported. | No |

Allowed values: `local`, `staging`, `production`.

## Database

| Variable | Purpose | Required for staging | Safe example | Secret handling | Missing readiness behavior | Can remain disabled |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma/Postgres runtime URL for Vercel serverless. Must use the Supabase transaction pooler. | Yes | `<paste Supabase transaction pooler URL, usually port 6543, with sslmode=require>` | Secret. Paste only in Vercel env UI/CLI. Do not commit. | Fail in staging/production-like checks if missing or if it appears to use session/direct port 5432. | No |
| `DIRECT_URL` | Direct/session database URL for Prisma migrations and admin operations. Do not use for Vercel runtime. | Yes | `<paste Supabase direct/session URL, usually port 5432, with sslmode=require>` | Secret. Paste only in Vercel env UI/CLI. Do not commit. | Fail in staging/production-like checks if missing; warn if identical to `DATABASE_URL`. | No |

Vercel/serverless must not use Supabase session mode for `DATABASE_URL`. Runtime routes such as `/dashboard` and `/admin/referrals` can exhaust the session pool and return `EMAXCONNSESSION` if `DATABASE_URL` points at port `5432`. Keep `DATABASE_URL` on the transaction pooler, usually port `6543`, and keep `DIRECT_URL` on direct/session, usually port `5432`, for Prisma migrations/admin work.

## Telnyx

| Variable | Purpose | Required for staging | Safe example | Secret handling | Missing readiness behavior | Can remain disabled |
| --- | --- | --- | --- | --- | --- | --- |
| `TELNYX_API_KEY` | Authenticates Telnyx outbound API calls when real SMS test mode is intentionally enabled. | Yes | `<paste from Telnyx>` | Secret. Do not print or commit. | Fail in staging/production-like checks. | No |
| `TELNYX_MESSAGING_PROFILE_ID` | Binds outbound sends to approved Telnyx profile. | Yes | `40019f0a-4f48-4749-9d5a-7bb4f0716cbe` | Public-safe identifier, but still keep in env. | Fail if missing; fail if different from approved profile for staging. | No |
| `TELNYX_FLOWVIA_FROM_NUMBER` | Approved sender number. | Yes | `+14692933948` | Public-safe number, but keep in env. | Fail if missing; fail if not exactly `+14692933948`. | No |
| `TELNYX_WEBHOOK_SIGNING_SECRET` | Telnyx v2 Ed25519 public key used to verify inbound webhook signatures. | Yes | `<paste Telnyx Ed25519 public key as hex or base64>` | Treat as sensitive config. Do not commit. | Fail in staging/production-like checks. | No |

## Pilot Auth

| Variable | Purpose | Required for staging | Safe example | Secret handling | Missing readiness behavior | Can remain disabled |
| --- | --- | --- | --- | --- | --- | --- |
| `FLOWVIA_ADMIN_EMAIL` | Admin login email allowlist. | Yes | `support@flowviahealth.com` | Not a password, but avoid broad screenshots. | Fail in staging/production-like checks. | No |
| `FLOWVIA_ADMIN_PASSWORD_HASH` | Scrypt password hash for admin pilot login. | Yes | `<generate with pnpm auth:hash>` | Secret-equivalent. Do not commit. Rotate temporary test password before serious use. | Fail in staging/production-like checks; warn if known temporary password hash is configured. | No |
| `FLOWVIA_THERAPIST_EMAILS` | Comma-separated therapist login allowlist. | Yes | `demo.north.dallas@flowviahealth.test` | Not a password, but avoid broad screenshots. | Fail in staging/production-like checks. | No |
| `FLOWVIA_THERAPIST_PASSWORD_HASH` | Scrypt password hash for therapist pilot login. | Yes | `<generate with pnpm auth:hash>` | Secret-equivalent. Do not commit. Rotate temporary test password before serious use. | Fail in staging/production-like checks; warn if known temporary password hash is configured. | No |
| `FLOWVIA_SESSION_SECRET` | Signs pilot session cookies. | Yes | `<64+ random chars>` | Secret. Generate strongly and rotate if exposed. | Fail in staging/production-like checks. | No |

Known temporary passwords are blockers before serious/production use:

- Admin: `FlowviaTest123!`
- Therapist: `FlowviaTherapist123!`

## Feature Gates

| Variable | Purpose | Required for staging | Safe example | Secret handling | Missing readiness behavior | Can remain disabled |
| --- | --- | --- | --- | --- | --- | --- |
| `FLOWVIA_PILOT_OPERATIONS_ENABLED` | Opens protected pilot dashboard/workspace routes. | Yes | `true` | Public-safe. | Fail in staging/production-like checks if not `true`. | No |
| `FLOWVIA_ADMIN_MESSAGES_ENABLED` | Opens admin Message Ledger in cloud. | Yes | `true` | Public-safe. | Fail in staging/production-like checks if not `true`. | No |
| `FLOWVIA_ALLOW_REAL_SMS_TEST` | Allows live Telnyx sends. | Yes | `false` | Public-safe. | Warn if `true`; staging should default to `false`. | Yes, keep `false` except controlled personal test window. |
| `FLOWVIA_DATA_MODE` | Data safety mode. | Yes | `personal_test` or `phi_blocked` | Public-safe. | Warn if missing in local; fail if unsupported or `phi_allowed` requested. | No |
| `FLOWVIA_AI_ENABLED` | Enables future operations assistant provider calls. | Yes | `false` | Public-safe. | Warn if missing and safe default is used; fail if real provider enabled without explicit allowance. | Yes, keep `false`. |
| `FLOWVIA_AI_PROVIDER` | AI provider selector. | Yes | `mock` or `none` | Public-safe. | Warn if missing and safe default is used; fail in staging if non-mock provider is active without explicit allowance. | Yes, use `mock` or `none`. |
| `FLOWVIA_AI_NO_PHI_MODE` | Requires AI paths to remain no-PHI. | Yes | `true` | Public-safe. | Warn if missing; fail if AI is enabled and this is not `true`. | No |
| `FLOWVIA_AI_AUDIT_ONLY` | Keeps AI suggestions non-mutating/auditable. | Yes | `true` | Public-safe. | Warn if missing; fail if AI is enabled and audit-only is not `true`. | No |
| `FLOWVIA_SMS_STORE_MODE` | Local/test SMS storage override. | No | empty | Public-safe. | Warn/fail if set to `json` or `test` in staging/production-like checks. | Yes, leave empty in Vercel. |
| `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST` | Local synthetic webhook-signing bypass. | No | `false` | Public-safe. | Fail if `true` in staging/production-like checks. | Yes, must remain `false`/unset in Vercel. |

Implemented data mode values are `fake`, `personal_test`, and `phi_blocked`. `phi_allowed` is a future blocked mode and must not be used in staging.

## Email

| Variable | Purpose | Required for staging | Safe example | Secret handling | Missing readiness behavior | Can remain disabled |
| --- | --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Optional email delivery for contact/notification flows. | No | `<paste from Resend>` | Secret. Do not commit. | Warn only if email delivery is expected. | Yes |
| `CONTACT_TO_EMAIL` | Public contact recipient. | No | `support@flowviahealth.com` | Public-safe. | No fail. | Yes |
| `CONTACT_FROM_EMAIL` | Public contact sender. | No | `Flowvia Health Website <onboarding@resend.dev>` | Public-safe unless using private mailbox details. | No fail. | Yes |

Email notification must remain optional for SMS consent. Missing Resend config must not block consent capture.

## Forbidden In Vercel/Staging

- `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true`
- Any localhost or ngrok URL as the final Telnyx webhook target
- `FLOWVIA_SMS_STORE_MODE=test`
- `FLOWVIA_SMS_STORE_MODE=json`
- `FLOWVIA_DATA_MODE=phi_allowed`
- Known temporary test passwords for serious/production use
- Any PHI, real patient data, diagnoses, medications, treatment details, symptoms, clinical notes, or emergency content
