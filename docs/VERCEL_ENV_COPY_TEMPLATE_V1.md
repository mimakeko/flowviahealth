# Vercel Env Copy Template V1

Copy this into the Vercel environment-variable UI/CLI as a checklist. Do not commit filled values. Do not paste real secrets into docs, chat, screenshots, or tickets.

## Required For Cloud Staging

```bash
# Deployment target - public-safe, required
FLOWVIA_DEPLOY_TARGET=staging

# Database - secret, required
# Vercel/serverless runtime: Supabase transaction pooler, usually port 6543, with SSL required.
DATABASE_URL=<paste Supabase transaction pooler URL with sslmode=require>
# Prisma migrations/admin: Supabase direct/session URL, usually port 5432, with SSL required.
DIRECT_URL=<paste Supabase direct/session URL with sslmode=require>

# Telnyx - required
TELNYX_API_KEY=<paste from Telnyx> # secret
TELNYX_MESSAGING_PROFILE_ID=40019f0a-4f48-4749-9d5a-7bb4f0716cbe # public-safe
TELNYX_FLOWVIA_FROM_NUMBER=+14692933948 # public-safe
TELNYX_WEBHOOK_SIGNING_SECRET=<paste Telnyx Ed25519 public key as hex or base64> # secret/config-sensitive

# Pilot auth - required
FLOWVIA_ADMIN_EMAIL=support@flowviahealth.com # public-safe enough for ops use
FLOWVIA_ADMIN_PASSWORD_HASH=<generate with pnpm auth:hash> # secret-equivalent
FLOWVIA_THERAPIST_EMAILS=demo.north.dallas@flowviahealth.test # public-safe enough for ops use
FLOWVIA_THERAPIST_PASSWORD_HASH=<generate with pnpm auth:hash> # secret-equivalent
FLOWVIA_SESSION_SECRET=<generate 64+ random chars> # secret

# Feature gates - public-safe, required
FLOWVIA_PILOT_OPERATIONS_ENABLED=true
FLOWVIA_ADMIN_MESSAGES_ENABLED=true
FLOWVIA_ALLOW_REAL_SMS_TEST=false
FLOWVIA_DATA_MODE=personal_test
FLOWVIA_AI_ENABLED=false
FLOWVIA_AI_PROVIDER=mock
FLOWVIA_AI_NO_PHI_MODE=true
FLOWVIA_AI_AUDIT_ONLY=true
FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=false
```

## Optional

```bash
# Email - optional; SMS consent must still work if missing
RESEND_API_KEY=<paste from Resend> # secret, optional
CONTACT_TO_EMAIL=support@flowviahealth.com # public-safe, optional
CONTACT_FROM_EMAIL=Flowvia Health Website <onboarding@resend.dev> # public-safe, optional

# SMS store override - leave empty/unset in Vercel
FLOWVIA_SMS_STORE_MODE=
```

## Do Not Set In Vercel

```bash
DATABASE_URL=<Supabase session/direct URL on port 5432>
DATABASE_URL=<same value as DIRECT_URL>
FLOWVIA_SMS_STORE_MODE=test
FLOWVIA_SMS_STORE_MODE=json
FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true
FLOWVIA_DATA_MODE=phi_allowed
```

## Password Blocker

Temporary local test passwords are allowed only for local smoke validation and are blockers before serious/production use:

- `FlowviaTest123!`
- `FlowviaTherapist123!`
