# Security Audit

Date: June 26, 2026  
Project: Flowvia Health

## Fixes

- Added stronger validation and maximum field lengths to contact and SMS consent routes.
- Added in-memory rate limiting.
- Escaped submitted content in email templates.
- Added generic user-facing errors and non-secret server logs.
- Added security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Disabled `X-Powered-By`.
- Added PostCSS override to clear moderate advisory.

## Verification

- `pnpm audit --audit-level moderate`: no known vulnerabilities found.
- Local headers verified.
- Local valid contact post reaches email configuration branch without exposing secrets.

## Remaining Recommendations

- Add managed bot protection if public forms receive abuse.
- Add route-level monitoring for email failures.
- Evaluate strict CSP after production validation.
- Rotate Resend and future Twilio credentials on a standard schedule.
