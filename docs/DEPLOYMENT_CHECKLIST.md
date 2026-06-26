# Deployment Checklist

Date: June 26, 2026  
Project: Flowvia Health

## Before Deploy

- Confirm Vercel project is linked.
- Confirm `flowviahealth.com` and `www.flowviahealth.com` domain configuration.
- Configure `RESEND_API_KEY`.
- Configure verified `CONTACT_FROM_EMAIL`.
- Confirm `CONTACT_TO_EMAIL`.

## After Deploy

- Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm audit --audit-level moderate`.
- Submit production contact form.
- Submit production SMS consent form with an email address.
- Confirm Resend dashboard events.
- Confirm support inbox delivery.
- Confirm autoresponder delivery.
- Check `/robots.txt`, `/sitemap.xml`, `/privacy`, `/terms`, `/hipaa`, `/sms-consent`, and `/contact`.
- Verify production security headers.

## Current Local Status

- Build checks passed locally.
- Production deployment was not performed because Vercel CLI/link configuration was not available locally.
- Real Resend/inbox verification is pending because no local `RESEND_API_KEY` was available.
