# Email System Hardening Report

Date: June 26, 2026  
Project: Flowvia Health

## Summary

The working Resend contact and SMS consent flows were preserved. This pass replaced route-local dark-sensitive HTML strings with a reusable email design-system module, added plain-text email bodies, improved subjects, and generated local render previews for light, dark-background, desktop, and mobile review.

## Files Modified

- `app/api/contact/route.ts`
- `app/api/sms-consent/route.ts`
- `lib/email-design-system.ts`
- `package.json`
- `scripts/render-email-previews.mts`
- `docs/email-previews/*`
- `docs/EMAIL_SYSTEM_HARDENING_REPORT.md`

## Reusable Component Architecture

- `lib/email-design-system.ts` defines:
  - `EmailBrand`
  - `EmailField`
  - `EmailSection`
  - `renderSubmissionEmail`
  - `renderAutoReplyEmail`
  - `buildSubmissionSubject`
  - `formatSubmittedAt`
- Flowvia uses the same rendering infrastructure as the Onzeon corporate site with Flowvia-specific brand configuration.
- Future products can reuse the same module by adding a brand object and passing product-specific fields.

## Branding Improvements

- Header uses Flowvia Health branding with a blue accent mark.
- Footer states: Flowvia Health is owned, developed, and operated by Onzeon Holdings LLC.
- Footer includes Flowvia contact details and the Flowvia website.
- Autoresponders reinforce the relationship with Onzeon Holdings LLC.

## Compatibility Notes

- Table-based email layout.
- Inline CSS only.
- No Tailwind classes inside email HTML.
- No CSS variables.
- Explicit font family, color, and background color throughout the email shell and content cards.
- White primary card background with very light gray sections.
- Plain text generated for every HTML email.

## Dark Mode Fixes

- Removed inherited-color email blocks that could invert poorly in Apple Mail.
- Added explicit `bgcolor` and inline `background-color` on table shells, cards, and content sections.
- Added explicit inline text colors for headings, labels, values, links, and footer text.
- Avoided transparent backgrounds in raw email HTML.
- Added light color-scheme metadata to reduce client-side color inversion surprises.

## Accessibility Improvements

- Semantic `h1` title in the email body.
- Clear label/value cards for scanability.
- Accessible font sizes and spacing.
- High-contrast charcoal text on white/light gray backgrounds.
- Plain text fallback for screen readers and clients with limited HTML support.

## Render Previews

Generated locally with:

```bash
pnpm render:emails
```

Preview index:

- `docs/email-previews/index.html`

Rendered emails:

- `docs/email-previews/flowvia-contact-internal.preview.html`
- `docs/email-previews/flowvia-contact-autoresponder.preview.html`
- `docs/email-previews/flowvia-sms-consent-internal.preview.html`
- `docs/email-previews/flowvia-sms-consent-autoresponder.preview.html`

Each preview page contains desktop light, mobile light, desktop dark-background, and mobile dark-background iframes. Raw email HTML and `.txt` plain-text versions are also generated.

## Regression Results

Passed:

```bash
pnpm render:emails
pnpm lint
pnpm typecheck
pnpm build
```

## Recommendations for Eidon, TBKUSA, and Onzeon Labs

- Add one brand object per product using the same `EmailBrand` shape.
- Keep all product email layouts on `renderSubmissionEmail` and `renderAutoReplyEmail`.
- Add product-specific preview fixtures before launch.
- If more repos are added, consider extracting this module into a private package so all products consume the exact same source.
