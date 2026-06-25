# Flowvia Health

Production-ready static marketing and compliance website for Flowvia Health, built with Next.js, TypeScript, and Tailwind CSS.

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

The contact form sends general inquiries to Flowvia Health support through Resend and does not store submissions in a database. The SMS consent form emails consent requests to Flowvia Health support and does not send SMS.

## Branding

The site uses `NEW_LOGO.svg` as the approved Flowvia mark source. Copies live under `public/brand/` for site use, and the horizontal lockup in `components/logo.tsx` combines the mark with the Flowvia Health text wordmark.
