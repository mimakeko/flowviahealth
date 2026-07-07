# Production Audit

Date: June 26, 2026  
Project: Flowvia Health

## Findings

- Contact form had Resend delivery but no autoresponder.
- SMS consent route had delivery but no submitter autoresponder when email was supplied.
- Flowvia/Onzeon relationship was not explicit enough across public pages and legal surfaces.
- Security headers were missing from app config.
- `X-Powered-By` was exposed.
- `pnpm audit` reported a moderate transitive PostCSS advisory.
- `https://www.flowviahealth.com` returned a TLS certificate name mismatch; `https://flowviahealth.com` returned HTTP 200.
- Local/shell `RESEND_API_KEY` was not present, so inbox and Resend dashboard delivery could not be verified from this environment.

## Fixes

- Added autoresponder to contact submissions.
- Added optional autoresponder to SMS consent submissions when email is provided.
- Added rate limiting and stronger field length validation.
- Added Flowvia/Onzeon relationship language to home, contact, privacy, terms, HIPAA, SMS consent, footer, metadata, and schema.
- Added Organization and SoftwareApplication JSON-LD with parent organization.
- Added security headers and disabled `X-Powered-By`.
- Added PNPM override for patched PostCSS and refreshed lockfile.

## Evidence

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm audit --audit-level moderate` returned no known vulnerabilities.
- Local production crawl returned HTTP 200 for `/`, `/sms-consent`, `/hipaa`, `/contact`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest`.
- Local production headers include `X-Frame-Options: DENY`; `X-Powered-By` is absent.

## Remaining Recommendations

- Fix/add the `www.flowviahealth.com` Vercel domain certificate or redirect strategy.
- Deploy to Vercel and run real Resend dashboard/inbox verification.
- Add branded Open Graph image assets.

## Pilot Workflow Addendum

- Therapist Opportunity Acceptance is implemented as a fake/demo-data operational workflow, not clinical acceptance or EMR documentation.
- State is derived from safe audit events: `opportunity_offered`, `opportunity_accepted`, `opportunity_declined`, and `opportunity_action_blocked`.
- Admin offer, therapist accept, and therapist decline are manual-only. The workflow sends no SMS, performs no auto-assignment or auto-acceptance, creates no visits automatically, and calls no external AI, matching, maps, geocoding, or travel-time APIs.
- Validation command: `pnpm opportunity:workflow-smoke`.
