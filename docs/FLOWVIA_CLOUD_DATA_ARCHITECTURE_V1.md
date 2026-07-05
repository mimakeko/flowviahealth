# Flowvia Cloud Data Architecture V1

This foundation prepares Flowvia for a small field pilot with 1-2 therapists using durable Postgres storage through Prisma.

## Storage stack

- App: Next.js App Router
- ORM: Prisma 7
- Database: Postgres
- Runtime driver: `@prisma/adapter-pg`
- Migration config: `prisma.config.ts`
- Schema: `prisma/schema.prisma`
- Initial migration: `prisma/migrations/20260702130000_field_pilot_foundation/migration.sql`

Prisma 7 keeps the connection URL out of `schema.prisma`. The app creates `PrismaClient` with `PrismaPg` and reads `DATABASE_URL` at runtime. Prisma CLI operations read `DIRECT_URL` through `prisma.config.ts`, falling back to `DATABASE_URL` only for local compatibility.

## Environment

Required for cloud/pilot:

```bash
DATABASE_URL=postgresql://... # Supabase transaction pooler for Vercel runtime, usually port 6543
DIRECT_URL=postgresql://... # Supabase direct/session URL for migrations/admin, usually port 5432
```

Required for Telnyx SMS:

```bash
TELNYX_API_KEY=
TELNYX_MESSAGING_PROFILE_ID=
TELNYX_FLOWVIA_FROM_NUMBER=+14692933948
TELNYX_WEBHOOK_SIGNING_SECRET=
```

Optional:

```bash
FLOWVIA_ADMIN_MESSAGES_ENABLED=true
FLOWVIA_ALLOW_REAL_SMS_TEST=false
FLOWVIA_SMS_STORE_MODE=
```

`FLOWVIA_SMS_STORE_MODE=json` is a local-only escape hatch. Do not use it in production.

## Data models

### Therapist

Stores the pilot therapist roster:

- `id`
- `name`
- `email`
- `phone`
- `active`
- `serviceAreaNotes`
- `createdAt`
- `updatedAt`

### PatientReferral

Stores lightweight referral intake and assignment state:

- `id`
- `patientName`
- `phone`
- `email`
- `city`
- `zip`
- `address`
- `referralSource`
- `careType`
- `notes`
- `status`
- `assignedTherapistId`
- `createdAt`
- `updatedAt`

Full address exists for operations but should not be shown broadly in admin lists or SMS.

### Visit

Stores visits linked to referrals and optionally therapists:

- `id`
- `referralId`
- `therapistId`
- `scheduledAt`
- `status`
- `notes`
- `createdAt`
- `updatedAt`

### SmsConsentEnrollment

Durable consent state:

- `id`
- `phone`
- `normalizedPhone`
- `fullName`
- `email`
- `status`
- `source`
- `consentTextVersion`
- `confirmedAt`
- `optedOutAt`
- `createdAt`
- `updatedAt`

`normalizedPhone` is unique and uses E.164 formatting.

### SmsMessage

SMS audit/message ledger:

- `id`
- `phone`
- `direction`
- `eventType`
- `body`
- `providerMessageId`
- `status`
- `dryRun`
- `createdAt`

### TelnyxWebhookEvent

Stores raw Telnyx webhook envelopes for idempotency and debugging:

- `id`
- `telnyxEventId`
- `eventType`
- `payloadJson`
- `processedAt`
- `createdAt`

### AuditLog

General audit trail for system actions:

- `id`
- `actorType`
- `actorId`
- `action`
- `entityType`
- `entityId`
- `metadataJson`
- `createdAt`

## SMS storage adapters

The public SMS store API lives in `lib/sms/store.ts`.

- Development without `DATABASE_URL`: JSON fallback
- Test mode with `FLOWVIA_SMS_STORE_MODE=test`: JSON test fallback
- Production or any environment with `DATABASE_URL`: Prisma/Postgres
- Production without `DATABASE_URL`: hard error

The JSON fallback remains only to preserve local development and dry-run tests.

## Migration commands

Generate Prisma Client:

```bash
pnpm db:generate
```

Create a new migration during development:

```bash
pnpm db:migrate
```

Apply committed migrations in staging/production:

```bash
pnpm db:deploy
```

Open Prisma Studio locally:

```bash
pnpm db:studio
```

## Deployment checklist

- Provision a managed Postgres database.
- Set `DATABASE_URL` in the deployment environment.
- Run `pnpm db:deploy` before or during deploy.
- Run `pnpm db:generate` during install/build.
- Set Telnyx environment variables.
- Configure Telnyx webhook URL to `/api/telnyx/webhook`.
- Enable `/admin/messages` in production only with `FLOWVIA_ADMIN_MESSAGES_ENABLED=true`.
- Keep admin pages behind environment gating until auth is added.
- Do not put PHI in SMS bodies, public forms, logs, or broad admin list views.
