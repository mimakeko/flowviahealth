# Telnyx A2P Compliance Report

Status: PASS_TELNYX_A2P_COMPLIANCE_READY_V1

Date: June 29, 2026

## Scope

Reviewed and hardened the Flowvia Health public website for Telnyx 10DLC/A2P campaign review while preserving the existing SMS consent workflow, Resend integration, API behavior, and Twilio compatibility.

Repositories reviewed:

- `/Users/onzeon/Desktop/flowviahealth`
- `/Users/onzeon/Desktop/onzeonholdings`

## Forced Opt-In Review

- The SMS consent checkbox remains visible, unchecked by default, user initiated, and never hidden.
- The generated production HTML confirms `#sms-opt-in` has no `required` attribute and no `checked` attribute.
- The mobile phone field remains visible and has `type="tel"` and `autocomplete="tel"`, but no browser-level `required` attribute.
- Client validation now prevents submission unless the visitor voluntarily enters a mobile number and checks the SMS consent box.
- Server validation still requires explicit SMS consent before accepting an enrollment request.
- Result: the browser no longer presents a simultaneous required phone-number plus required SMS-checkbox pattern that could be interpreted as forced opt-in.

## Validation Review

- Added explicit client-side enrollment validation before the existing `/api/sms-consent` request.
- Preserved existing server validation, PHI disclaimer validation, rate limiting, spam protection, and Resend sending behavior.
- Added `type="text"` to the full-name input for explicit generated HTML.
- Confirmed no hidden SMS consent fields are present.

## Consent Workflow Review

Official workflow now appears consistently:

1. Patient voluntarily visits `https://flowviahealth.com/sms-consent`.
2. Patient enters mobile phone number.
3. Patient checks the visible SMS consent checkbox.
4. Patient submits the form.
5. Consent is stored through the existing implementation.
6. Transactional SMS is enabled only after the enrollment and confirmation process is completed.

Removed or replaced wording suggesting instant SMS delivery, implied enrollment, verbal consent, agency intake, intake paperwork, or alternate opt-in methods.

## Consent Language

The SMS consent page and related legal copy now include:

- Message frequency varies.
- Message and data rates may apply.
- Reply STOP to opt out.
- Reply HELP for assistance.
- Consent is not a condition of receiving healthcare services.
- Privacy Policy link.
- Terms of Service link.
- No promotional or advertising use of the SMS program.

## Screenshot Readiness

The production SMS consent page clearly renders:

- Phone Number field
- Visible unchecked SMS Consent checkbox
- Consent disclosure
- Privacy Policy and Terms of Service links
- Submit SMS Consent button
- "What messages you'll receive" informational section

Browser verification was performed at desktop and mobile widths. Screenshots were captured during verification but were not committed as binary artifacts.

## HTML Review

Generated production HTML checks passed:

- No duplicate IDs in the consent form surface.
- No hidden SMS consent fields.
- SMS checkbox is not prechecked.
- SMS checkbox is not browser-required.
- Mobile number field is not browser-required.
- Mobile number field uses `type="tel"` and `autocomplete="tel"`.
- Labels are present for the mobile phone field and SMS checkbox.
- Disclosure text is present in generated HTML.

`html-validate` was also run against fetched production HTML. The raw recommended preset reported React/Next SSR style-rule noise such as `charSet`, `autoComplete`, self-closing void elements, framework script attributes, and inline image styles. After fixing the meaningful input-type finding and rerunning with those React/Next style-only rules disabled, validation passed.

## SEO And Structured Data Review

- Flowvia canonical URLs verified for `/sms-consent`, `/privacy`, and `/terms`.
- Onzeon canonical URLs verified for `/` and `/products`.
- JSON-LD parsed successfully on verified Flowvia and Onzeon pages.
- Flowvia legal pages reference the official opt-in URL: `https://flowviahealth.com/sms-consent`.
- No SMS opt-in inconsistencies found in structured data.

## Ownership Consistency

Flowvia and Onzeon copy now consistently describe Flowvia Health as owned, developed, and operated by Onzeon Holdings LLC where ownership is discussed.

Reviewed Onzeon pages for contradictory ownership language:

- Home
- About
- Company
- Products
- Technology
- Contact
- Privacy
- Terms

## Legal And Content Consistency

Reviewed Flowvia:

- SMS Consent
- Privacy Policy
- Terms of Service
- Contact
- Footer
- HIPAA & Security
- Documentation and campaign submission notes

Flowvia is described as a healthcare workflow, scheduling, care coordination, and transactional healthcare messaging platform. It is not described as a marketing platform.

## Security Verification

Headers verified on production local servers:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()`
- `X-Powered-By` absent

`pnpm audit --audit-level moderate` returned no known vulnerabilities in both repositories.

## Route Verification

Flowvia routes returned HTTP 200:

- `/`
- `/sms-consent`
- `/privacy`
- `/terms`
- `/contact`
- `/hipaa`
- `/robots.txt`
- `/sitemap.xml`
- `/manifest.webmanifest`

Onzeon routes returned HTTP 200:

- `/`
- `/about`
- `/company`
- `/products`
- `/technology`
- `/contact`
- `/privacy`
- `/terms`
- `/robots.txt`
- `/sitemap.xml`
- `/manifest.webmanifest`

## Build Verification

Flowvia:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm audit --audit-level moderate` passed with no known vulnerabilities.

Onzeon:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm audit --audit-level moderate` passed with no known vulnerabilities.

## Files Modified

Flowvia:

- `components/sms-consent-form.tsx` - removed browser-forced SMS opt-in pattern, added explicit client validation, improved disclosure, added explicit full-name input type.
- `app/sms-consent/page.tsx` - clarified transactional enrollment behavior and added "What messages you'll receive" section.
- `app/privacy/page.tsx` - aligned SMS privacy wording and official opt-in URL.
- `app/terms/page.tsx` - aligned SMS program wording and official opt-in URL.
- `app/api/sms-consent/route.ts` - aligned SMS wording in existing email content without changing Resend integration.
- `scripts/render-email-previews.mts` and `docs/email-previews/*` - regenerated previews to match existing template wording.
- `app/layout.tsx`, `app/page.tsx`, `app/contact/page.tsx`, `app/hipaa/page.tsx`, `app/manifest.ts`, `components/site-footer.tsx` - aligned product, platform, and ownership wording.
- `README.md`, `docs/EMAIL_ARCHITECTURE.md`, `docs/FLOWVIA_ONZEON_RELATIONSHIP.md`, `docs/TWILIO_READINESS_REPORT.md`, `docs/twilio-a2p-campaign-submission.md`, `docs/EMAIL_SYSTEM_HARDENING_REPORT.md` - aligned documentation and campaign review language.
- `tsconfig.tsbuildinfo` - updated by TypeScript/build verification.

Onzeon:

- `app/layout.tsx`, `app/about/page.tsx`, `app/company/page.tsx`, `app/contact/page.tsx`, `app/page.tsx`, `app/privacy/page.tsx`, `app/products/page.tsx`, `app/technology/page.tsx`, `app/terms/page.tsx` - aligned ownership language and added canonical metadata where missing.
- `components/site-footer.tsx`, `lib/site-data.ts` - aligned Flowvia ownership/product descriptions.
- `docs/FLOWVIA_ONZEON_RELATIONSHIP.md`, `docs/TWILIO_READINESS_REPORT.md` - aligned ownership documentation.

## Production Readiness

Production readiness is confirmed for the requested Telnyx A2P compliance hardening scope.

## Recommendations

- Keep Telnyx campaign submission copy synchronized with `docs/twilio-a2p-campaign-submission.md`.
- Use `https://flowviahealth.com/sms-consent` as the single public opt-in URL in Telnyx, Twilio, screenshots, and support documentation.
- Capture a fresh production screenshot of `/sms-consent` after deployment for Telnyx reviewer evidence.
- Continue routing legal/compliance language changes through counsel as SMS workflows evolve.
