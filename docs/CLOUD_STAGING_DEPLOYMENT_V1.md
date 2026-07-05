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
    - `DATABASE_URL` uses the Supabase transaction pooler for Vercel/serverless runtime, usually port `6543`, with SSL required.
    - `DIRECT_URL` uses the Supabase direct/session URL for Prisma migrations/admin operations, usually port `5432`, with SSL required.
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

11. Before smoke testing internal routes, verify Vercel `DATABASE_URL` is not the Supabase session/direct URL. It must be the transaction pooler URL, usually port `6543`. Keep `DIRECT_URL` separate on direct/session, usually port `5432`.

12. Confirm forbidden staging values are absent/off:

    - `DATABASE_URL` using Supabase session/direct port `5432`
    - `DATABASE_URL` identical to `DIRECT_URL`
    - `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true`
    - `FLOWVIA_SMS_STORE_MODE=test`
    - `FLOWVIA_SMS_STORE_MODE=json`
    - `FLOWVIA_DATA_MODE=phi_allowed`
    - Any localhost/ngrok webhook URL as final webhook

13. Deploy through Vercel.

14. Confirm Vercel build succeeds.

15. Confirm public routes:

    - `https://flowviahealth.com/`
    - `https://flowviahealth.com/sms-consent`
    - `https://flowviahealth.com/privacy`
    - `https://flowviahealth.com/terms`
    - `https://flowviahealth.com/hipaa`
    - `https://flowviahealth.com/contact`

16. Confirm protected routes redirect unauthenticated:

    - `https://flowviahealth.com/dashboard`
    - `https://flowviahealth.com/admin/referrals`
    - `https://flowviahealth.com/admin/visits`
    - `https://flowviahealth.com/admin/messages`
    - `https://flowviahealth.com/my-work`

17. Confirm admin login.

18. Confirm therapist login.

19. Confirm therapist is blocked from admin routes:

    - `/admin/referrals`
    - `/admin/visits`
    - `/admin/messages`
    - `/admin/health`
    - `/admin/audit`
    - `/admin/data`

20. Confirm Message Ledger says:

    - Storage: `Postgres`
    - API key configured
    - Messaging profile configured
    - Webhook signing configured/enforced
    - Real SMS test off unless explicitly testing
    - Unsigned webhook bypass disabled
    - AI disabled/mock and audit-only
    - Data mode is `personal_test` or `phi_blocked`

21. Set Telnyx inbound webhook URL:

    ```text
    https://flowviahealth.com/api/telnyx/webhook
    ```

    Method: `POST`

22. Confirm Telnyx webhook signing is configured in Telnyx and Vercel.

23. Controlled personal-phone-only test:

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

24. Confirm `FLOWVIA_ALLOW_REAL_SMS_TEST=false` after the test.

25. Confirm no unsigned webhook bypass is enabled.

26. Confirm no real patients and no PHI were used.

27. Rotate temporary passwords before serious use.

## Hard Stops

- Do not deploy from prep-only prompts.
- Do not send real SMS except during the explicit personal-phone test window.
- Do not use ngrok for cloud staging cutover.
- Do not enter PHI, real patient data, diagnosis, medication, treatment details, symptoms, clinical notes, wound details, therapy plans, pain scores, or emergency details.
- Do not leave `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true` in any Vercel environment.
- Do not leave `FLOWVIA_ALLOW_REAL_SMS_TEST=true` after controlled testing.

## Rollback / Pause

If a staging check fails, stop the cutover and keep Telnyx pointed away from the cloud endpoint until the root cause is fixed. Keep real SMS test mode off while debugging unless a controlled owner-phone test is actively in progress.

## Cloud Pilot Daily Check

1. Open `/admin/health` and confirm deploy target, data mode, database URL mode, webhook signing, Telnyx config, SMS store mode, and latest activity timestamps look healthy.
2. Open `/admin/messages` and confirm Cloud webhook last seen, latest inbound keyword, consent state, and Message Ledger rows are current.
3. Open `/admin/referrals`, filter for `New`, `Contacted`, or `Needs scheduling`, then update assignment and visit scheduling only with fake pilot data.
4. Open `/admin/visits`, filter for `Upcoming`, `Needs scheduling`, or in-progress visits, then update lifecycle status and no-PHI operational notes.
5. Have therapists review `/my-work`; therapist actions stay limited to operational status and note updates, with no assignment, SMS send, or bulk controls.
6. Open `/admin/audit` and confirm recent status, assignment, visit, SMS consent, and permission events look expected with safe metadata only.
7. Open `/admin/data` only for fake-data stewardship; verify it shows audit-preserving cleanup and does not expose full phone numbers, raw SMS bodies, secrets, or provider payloads.
8. Confirm Real SMS gate is Off except during an explicit controlled personal-phone test window.
9. Confirm Vercel logs show no 500s on `/dashboard`, `/admin/referrals`, `/admin/visits`, `/admin/messages`, `/admin/health`, `/admin/audit`, or `/admin/data`.
10. Confirm no `EMAXCONNSESSION` errors are present.
11. Confirm no TLS or certificate errors are present.
12. Confirm data mode remains `personal_test` or `phi_blocked`; never enable PHI for the pilot.
13. Remind operators that notes must not include diagnosis, symptoms, treatment details, medication, emergency details, wound details, therapy plans, pain scores, full addresses, or clinical narratives.

## Pilot Data Stewardship Policy

- Use `/admin/data` only for fake demo data, explicit smoke-test records, and known personal-number test cleanup.
- Do not delete audit logs, SMS consent enrollments, SMS messages, or Telnyx webhook event history.
- Archive over delete. Completed/canceled fake workflows and smoke-test operational records should be marked as archived while preserving audit references.
- Personal-number tests must end `opted_out` unless an active controlled personal-phone test window is underway.
- Data stewardship tools must not send SMS, add bulk messaging controls, print secrets, expose raw SMS bodies, or display full phone numbers.

## No-PHI AI Operations Assistant Policy

- Operations Assistant V2 must remain deterministic/mock-only for cloud staging.
- External AI/API calls are disabled.
- No autonomous scheduling, assignment, messaging, or record mutation is allowed.
- Assistant cards are operational hints only and require human review.
- The assistant must not provide clinical advice, diagnosis, treatment guidance, or triage.
- No PHI should be used in assistant inputs or outputs.
- Before/after deploy, confirm `/admin/health` reports provider `mock / deterministic`, external API calls disabled, no-PHI enforcement on, and autonomous actions disabled.

Optional terminal checks:

```bash
pnpm cloud:readiness
pnpm db:pool-smoke
pnpm telnyx:cloud-readiness
```

## Troubleshooting

### `EMAXCONNSESSION` max clients reached in session mode

Symptom: Vercel runtime returns 500 on Prisma-backed internal routes such as `/dashboard` or `/admin/referrals`, and logs include:

```text
DriverAdapterError: (EMAXCONNSESSION) max clients reached in session mode
```

Cause: Vercel/serverless runtime is using a Supabase session/direct Postgres URL for `DATABASE_URL`, usually port `5432`. Serverless functions can create enough concurrent sessions to exhaust the small session pool.

Fix:

1. In Supabase, copy the transaction pooler connection string for app/runtime use. It usually uses port `6543`.
2. In Vercel, set `DATABASE_URL` to that transaction pooler URL and include SSL requirements.
3. Keep `DIRECT_URL` as the Supabase direct/session URL for Prisma migrations/admin operations, usually port `5432`.
4. Redeploy from GitHub or trigger a normal Vercel redeploy after the env var change.
5. Re-test `/dashboard`, `/admin/referrals`, and `/admin/visits`.
