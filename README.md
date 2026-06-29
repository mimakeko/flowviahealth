# Flowvia Health

Production-ready marketing and compliance website for Flowvia Health, a
healthcare workflow, scheduling, care coordination, and transactional healthcare
messaging platform owned, developed, and operated by Onzeon Holdings LLC.
Built with Next.js, TypeScript, Tailwind CSS, and Resend-backed contact routes.

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
```

## Deploy to Vercel

Import the repository in Vercel. The default Next.js framework settings are sufficient.

Required environment variable:

- `RESEND_API_KEY` — enables `/api/contact` and `/api/sms-consent` email delivery.

Optional environment variables:

- `CONTACT_TO_EMAIL` — defaults to `support@flowviahealth.com`.
- `CONTACT_FROM_EMAIL` — defaults to `Flowvia Health Website <onboarding@resend.dev>`.

## Public compliance routes

- `/sms-consent`
- `/privacy`
- `/terms`
- `/hipaa`
- `/contact`

The contact form sends general inquiries to Flowvia Health support through
Resend, sends an autoresponder to the submitter, and does not store submissions
in a database. The SMS consent form emails voluntary enrollment requests to
Flowvia Health support, sends an autoresponder when the submitter provides an
email address, and does not instantly send an SMS from the public form itself.

## Corporate relationship

Flowvia Health is owned, developed, and operated by Onzeon Holdings LLC.
Parent company website: `https://www.onzeonholdings.com`.

## Branding

The site uses `NEW_LOGO.svg` as the approved Flowvia mark source. Copies live under `public/brand/` for site use, and the horizontal lockup in `components/logo.tsx` combines the mark with the Flowvia Health text wordmark.
