# Flowvia Health

Production-ready marketing and compliance website for Flowvia Health, a
healthcare workflow, scheduling, care coordination, and transactional healthcare
messaging platform owned, developed, and operated by Onzeon Holdings LLC.
Built with Next.js, TypeScript, Tailwind CSS, Resend-backed contact routes,
Telnyx-backed transactional SMS consent workflows, and Prisma/Postgres storage
for field-pilot data.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:telnyx
pnpm db:generate
```

## Deploy to Vercel

Import the repository in Vercel. The default Next.js framework settings are sufficient.

Required email environment variable:

- `RESEND_API_KEY` — enables `/api/contact` and `/api/sms-consent` email delivery.

Required production SMS environment variables:

- `DATABASE_URL`
- `TELNYX_API_KEY`
- `TELNYX_MESSAGING_PROFILE_ID`
- `TELNYX_FLOWVIA_FROM_NUMBER=+14692933948`
- `TELNYX_WEBHOOK_SIGNING_SECRET` — Telnyx Ed25519 public key for webhook verification.

Optional environment variables:

- `CONTACT_TO_EMAIL` — defaults to `support@flowviahealth.com`.
- `CONTACT_FROM_EMAIL` — defaults to `Flowvia Health Website <onboarding@resend.dev>`.

## Public compliance routes

- `/sms-consent`
- `/privacy`
- `/terms`
- `/hipaa`
- `/contact`
- `/api/telnyx/webhook`

The contact form sends general inquiries to Flowvia Health support through
Resend, sends an autoresponder to the submitter, and does not store submissions
in a database. The SMS consent form emails voluntary enrollment requests to
Flowvia Health support, sends an autoresponder when the submitter provides an
email address, stores a pending SMS enrollment, and sends a Telnyx confirmation
SMS that requires a `YES` response before transactional SMS is active.

See `docs/TELNYX_MESSAGING_ENGINE_V1.md` for Telnyx setup, webhook behavior,
dry-run tests, and production checklist.

See `docs/FLOWVIA_FIELD_PILOT_RUNBOOK_V1.md` and
`docs/FLOWVIA_CLOUD_DATA_ARCHITECTURE_V1.md` for the 1-2 therapist pilot
database foundation and rollout checklist.

## Corporate relationship

Flowvia Health is owned, developed, and operated by Onzeon Holdings LLC.
Parent company website: `https://www.onzeonholdings.com`.

## Branding

The site uses `NEW_LOGO.svg` as the approved Flowvia mark source. Copies live under `public/brand/` for site use, and the horizontal lockup in `components/logo.tsx` combines the mark with the Flowvia Health text wordmark.
