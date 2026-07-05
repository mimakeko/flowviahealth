-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('new', 'contacted', 'scheduled', 'active', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('unscheduled', 'scheduled', 'in_progress', 'completed', 'canceled', 'no_show');

-- CreateEnum
CREATE TYPE "SmsConsentStatus" AS ENUM ('pending_confirmation', 'active', 'opted_out');

-- CreateEnum
CREATE TYPE "SmsConsentSource" AS ENUM ('sms_consent_page');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "serviceAreaNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientReferral" (
    "id" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "address" TEXT,
    "referralSource" TEXT,
    "careType" TEXT,
    "notes" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'new',
    "assignedTherapistId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "therapistId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'unscheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsConsentEnrollment" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "status" "SmsConsentStatus" NOT NULL DEFAULT 'pending_confirmation',
    "source" "SmsConsentSource" NOT NULL DEFAULT 'sms_consent_page',
    "consentTextVersion" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConsentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "eventType" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelnyxWebhookEvent" (
    "id" TEXT NOT NULL,
    "telnyxEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelnyxWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_email_key" ON "Therapist"("email");

-- CreateIndex
CREATE INDEX "Therapist_active_idx" ON "Therapist"("active");

-- CreateIndex
CREATE INDEX "PatientReferral_status_idx" ON "PatientReferral"("status");

-- CreateIndex
CREATE INDEX "PatientReferral_assignedTherapistId_idx" ON "PatientReferral"("assignedTherapistId");

-- CreateIndex
CREATE INDEX "PatientReferral_createdAt_idx" ON "PatientReferral"("createdAt");

-- CreateIndex
CREATE INDEX "Visit_referralId_idx" ON "Visit"("referralId");

-- CreateIndex
CREATE INDEX "Visit_therapistId_idx" ON "Visit"("therapistId");

-- CreateIndex
CREATE INDEX "Visit_scheduledAt_idx" ON "Visit"("scheduledAt");

-- CreateIndex
CREATE INDEX "Visit_status_idx" ON "Visit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConsentEnrollment_normalizedPhone_key" ON "SmsConsentEnrollment"("normalizedPhone");

-- CreateIndex
CREATE INDEX "SmsConsentEnrollment_status_idx" ON "SmsConsentEnrollment"("status");

-- CreateIndex
CREATE INDEX "SmsConsentEnrollment_createdAt_idx" ON "SmsConsentEnrollment"("createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_phone_idx" ON "SmsMessage"("phone");

-- CreateIndex
CREATE INDEX "SmsMessage_providerMessageId_idx" ON "SmsMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_eventType_idx" ON "SmsMessage"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "TelnyxWebhookEvent_telnyxEventId_key" ON "TelnyxWebhookEvent"("telnyxEventId");

-- CreateIndex
CREATE INDEX "TelnyxWebhookEvent_eventType_idx" ON "TelnyxWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "TelnyxWebhookEvent_createdAt_idx" ON "TelnyxWebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_idx" ON "AuditLog"("actorType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "PatientReferral" ADD CONSTRAINT "PatientReferral_assignedTherapistId_fkey" FOREIGN KEY ("assignedTherapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "PatientReferral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
