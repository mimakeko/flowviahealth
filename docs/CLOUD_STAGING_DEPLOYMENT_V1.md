# Cloud Staging Deployment V1

Goal: deploy always-on Flowvia cloud staging at `https://flowviahealth.com` after this prep pass. This document is a runbook for the later commit/push/deploy step. Do not deploy from this prep pass.

Boundary: fake data only, personal phone only, no PHI, no real patients, no clinical notes, no real SMS except the short controlled owner-phone test window.

## Tomorrow Checklist

1. Review git status.

   ```bash
   git status --short
   ```

2. Run full validation before committing.

   ```bash
   pnpm db:smoke
   pnpm notes:classification-smoke
   pnpm ops:guardrail-smoke
   FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_SMS_STORE_MODE=test pnpm test:telnyx
   pnpm cloud:readiness
   pnpm hipaa:readiness
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm audit --audit-level moderate
   ```

3. Start a safe local server for route smokes.

   ```bash
   FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_SMS_STORE_MODE=test pnpm dev
   ```

4. In another terminal, run route smokes sequentially because they share the test SMS store.

   ```bash
   FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_SMS_STORE_MODE=test pnpm sms-consent:route-smoke
   FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_SMS_STORE_MODE=test pnpm telnyx:webhook-smoke
   FLOWVIA_ALLOW_REAL_SMS_TEST=false FLOWVIA_SMS_STORE_MODE=test \
     FLOWVIA_AUTH_SMOKE_EMAIL='support@flowviahealth.com' \
     FLOWVIA_AUTH_SMOKE_PASSWORD='FlowviaTest123!' \
     FLOWVIA_AUTH_SMOKE_THERAPIST_EMAIL='demo.north.dallas@flowviahealth.test' \
     FLOWVIA_AUTH_SMOKE_THERAPIST_PASSWORD='FlowviaTherapist123!' \
     pnpm auth:route-smoke
   ```

5. Stop the local dev server.

6. Commit.

   ```bash
   git add .
   git commit -m "Prepare Flowvia cloud staging"
   ```

7. Push to GitHub.

   ```bash
   git push
   ```

8. Confirm the Vercel project is linked to the GitHub repo.

9. Add Vercel env vars from `docs/VERCEL_ENV_MANIFEST_V1.md`.

10. Confirm required staging values:

    - `FLOWVIA_DEPLOY_TARGET=staging`
    - `DATABASE_URL`
    - `DIRECT_URL`
    - `TELNYX_API_KEY`
    - `TELNYX_MESSAGING_PROFILE_ID=40019f0a-4f48-4749-9d5a-7bb4f0716cbe`
    - `TELNYX_FLOWVIA_FROM_NUMBER=+14692933948`
    - `TELNYX_WEBHOOK_SIGNING_SECRET`
    - `FLOWVIA_ADMIN_EMAIL`
    - `FLOWVIA_ADMIN_PASSWORD_HASH`
    - `FLOWVIA_THERAPIST_EMAILS`
    - `FLOWVIA_THERAPIST_PASSWORD_HASH`
    - `FLOWVIA_SESSION_SECRET`
    - `FLOWVIA_PILOT_OPERATIONS_ENABLED=true`
    - `FLOWVIA_ADMIN_MESSAGES_ENABLED=true`
    - `FLOWVIA_ALLOW_REAL_SMS_TEST=false`
    - `FLOWVIA_DATA_MODE=personal_test` or `FLOWVIA_DATA_MODE=phi_blocked`
    - `FLOWVIA_AI_ENABLED=false`
    - `FLOWVIA_AI_PROVIDER=mock`
    - `FLOWVIA_AI_NO_PHI_MODE=true`
    - `FLOWVIA_AI_AUDIT_ONLY=true`

11. Confirm forbidden staging values are absent/off:

    - `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true`
    - `FLOWVIA_SMS_STORE_MODE=test`
    - `FLOWVIA_SMS_STORE_MODE=json`
    - `FLOWVIA_DATA_MODE=phi_allowed`
    - Any localhost/ngrok webhook URL as final webhook

12. Deploy through Vercel.

13. Confirm Vercel build succeeds.

14. Confirm public routes:

    - `https://flowviahealth.com/`
    - `https://flowviahealth.com/sms-consent`
    - `https://flowviahealth.com/privacy`
    - `https://flowviahealth.com/terms`
    - `https://flowviahealth.com/hipaa`
    - `https://flowviahealth.com/contact`

15. Confirm protected routes redirect unauthenticated:

    - `https://flowviahealth.com/dashboard`
    - `https://flowviahealth.com/admin/referrals`
    - `https://flowviahealth.com/admin/visits`
    - `https://flowviahealth.com/admin/messages`
    - `https://flowviahealth.com/my-work`

16. Confirm admin login.

17. Confirm therapist login.

18. Confirm therapist is blocked from admin routes:

    - `/admin/referrals`
    - `/admin/visits`
    - `/admin/messages`

19. Confirm Message Ledger says:

    - Storage: `Postgres`
    - API key configured
    - Messaging profile configured
    - Webhook signing configured/enforced
    - Real SMS test off unless explicitly testing
    - Unsigned webhook bypass disabled
    - AI disabled/mock and audit-only
    - Data mode is `personal_test` or `phi_blocked`

20. Set Telnyx inbound webhook URL:

    ```text
    https://flowviahealth.com/api/telnyx/webhook
    ```

    Method: `POST`

21. Confirm Telnyx webhook signing is configured in Telnyx and Vercel.

22. Controlled personal-phone-only test:

    - Temporarily set `FLOWVIA_ALLOW_REAL_SMS_TEST=true` in Vercel.
    - Redeploy/restart as needed.
    - Submit `/sms-consent` with owner personal phone and fake data only.
    - Confirm outbound SMS.
    - Reply `START` or `YES`.
    - Confirm response.
    - Reply `HELP`.
    - Confirm response.
    - Reply `STOP`.
    - Confirm opt-out response.
    - Confirm Message Ledger rows, consent state, webhook events, and audit.
    - Set `FLOWVIA_ALLOW_REAL_SMS_TEST=false` immediately afterward.
    - Redeploy/restart as needed.

23. Confirm `FLOWVIA_ALLOW_REAL_SMS_TEST=false` after the test.

24. Confirm no unsigned webhook bypass is enabled.

25. Confirm no real patients and no PHI were used.

26. Rotate temporary passwords before serious use.

## Hard Stops

- Do not deploy from prep-only prompts.
- Do not send real SMS except during the explicit personal-phone test window.
- Do not use ngrok for cloud staging cutover.
- Do not enter PHI, real patient data, diagnosis, medication, treatment details, symptoms, clinical notes, wound details, therapy plans, pain scores, or emergency details.
- Do not leave `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true` in any Vercel environment.
- Do not leave `FLOWVIA_ALLOW_REAL_SMS_TEST=true` after controlled testing.

## Rollback / Pause

If a staging check fails, stop the cutover and keep Telnyx pointed away from the cloud endpoint until the root cause is fixed. Keep real SMS test mode off while debugging unless a controlled owner-phone test is actively in progress.
