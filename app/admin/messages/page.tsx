import type { Metadata } from "next";
import { AlertTriangle, MessageSquareText, ShieldCheck } from "lucide-react";
import { getOperationsAssistantStatus } from "@/lib/ai/operations-assistant";
import { getFlowviaDataModeStatus } from "@/lib/compliance/data-mode";
import { safeInboundKeywordLabel } from "@/lib/pilot/cloud-health";
import { requireAdminMessagesAccess } from "@/lib/pilot/access";
import { redactPhone } from "@/lib/sms/compliance";
import { getSmsStoreSnapshot, getSmsStoreStatus } from "@/lib/sms/store";
import { getTelnyxConfigStatus } from "@/lib/sms/telnyx";

export const metadata: Metadata = {
  title: "SMS Message Ledger",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatTimestamp(value?: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClassName(status?: string) {
  if (status === "active" || status === "delivered") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "opted_out" || status === "failed" || status === "undelivered") return "bg-rose-50 text-rose-800 ring-rose-200";
  if (status === "pending_confirmation" || status === "dry_run") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function shortId(value?: string) {
  if (!value) return "Not recorded";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export default async function AdminMessagesPage() {
  requireAdminMessagesAccess();

  const snapshot = await getSmsStoreSnapshot();
  const telnyx = getTelnyxConfigStatus();
  const dataMode = getFlowviaDataModeStatus();
  const storeStatus = getSmsStoreStatus();
  const aiStatus = getOperationsAssistantStatus();
  const deployTarget = (process.env.FLOWVIA_DEPLOY_TARGET || process.env.VERCEL_ENV || process.env.NODE_ENV || "local").toLowerCase();
  const smsStoreMode = process.env.FLOWVIA_SMS_STORE_MODE || "default";
  const enrollmentByPhone = new Map(snapshot.enrollments.map((enrollment) => [enrollment.phone, enrollment]));
  const latestWebhook = (snapshot.webhookEvents ?? [])[0];
  const latestInboundMessage = snapshot.messages.find((message) => message.direction === "inbound");
  const latestOutboundMessage = snapshot.messages.find((message) => message.direction === "outbound");
  const warnings = [
    telnyx.webhookSigningDevSkipped ? "Webhook signing is skipped because no signing key is configured. This is local/dev only." : null,
    telnyx.unsignedWebhookTestBypassEnabled ? "Unsigned Telnyx webhook test bypass is enabled. Disable it before staging or production." : null,
    telnyx.realSmsTestsEnabled ? "Real SMS test mode is enabled. Use personal phone numbers only and turn it off after testing." : null,
    storeStatus.warning ?? null,
    dataMode.noPhiRequired ? dataMode.warningLabel : null,
    ...dataMode.blockers,
  ].filter(Boolean);

  return (
    <div>
        <div className="flex flex-col gap-5 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Internal</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">SMS message ledger</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Transactional SMS consent, inbound replies, outbound confirmations, and delivery status for Flowvia Health.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            <AlertTriangle size={18} />
            No PHI in SMS or public forms
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-5">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><MessageSquareText size={18} />Enrollments</div>
            <p className="mt-3 text-3xl font-semibold text-ink">{snapshot.enrollments.length}</p>
          </div>
          <div className="rounded-lg border border-line bg-white p-5">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><ShieldCheck size={18} />Active consent</div>
            <p className="mt-3 text-3xl font-semibold text-ink">{snapshot.enrollments.filter((item) => item.status === "active").length}</p>
          </div>
          <div className="rounded-lg border border-line bg-white p-5">
            <div className="text-sm font-semibold text-slate-600">Telnyx configuration</div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt>API key</dt><dd>{telnyx.apiKeyConfigured ? "Configured" : "Missing"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Messaging profile</dt><dd>{telnyx.messagingProfileConfigured ? "Configured" : "Missing"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Webhook signing</dt><dd>{telnyx.webhookSigningConfigured ? "Configured" : "Dev skipped"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Real SMS test</dt><dd>{telnyx.realSmsTestsEnabled ? "On" : "Off"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Data mode</dt><dd>{dataMode.safeLabel}</dd></div>
              <div className="flex justify-between gap-3"><dt>Storage</dt><dd>{storeStatus.label}</dd></div>
            </dl>
          </div>
        </div>

        <details className="mt-4 rounded-lg border border-line bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Cloud staging and policy detail</summary>
          <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="flex justify-between gap-3"><dt>Deploy target</dt><dd className="font-semibold text-ink">{deployTarget}</dd></div>
            <div className="flex justify-between gap-3"><dt>Data mode</dt><dd className="font-semibold text-ink">{dataMode.safeLabel}</dd></div>
            <div className="flex justify-between gap-3"><dt>Real SMS gate</dt><dd className="font-semibold text-ink">{telnyx.realSmsTestsEnabled ? "On" : "Off"}</dd></div>
            <div className="flex justify-between gap-3"><dt>AI mode</dt><dd className="font-semibold text-ink">{aiStatus.modeLabel}</dd></div>
            <div className="flex justify-between gap-3"><dt>AI no-PHI</dt><dd className="font-semibold text-ink">{aiStatus.noPhiMode ? "On" : "Off"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Webhook signing</dt><dd className="font-semibold text-ink">{telnyx.webhookSigningConfigured ? "Configured" : "Missing/dev skipped"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Unsigned bypass</dt><dd className="font-semibold text-ink">{telnyx.unsignedWebhookTestBypassEnabled ? "Enabled" : "Disabled"}</dd></div>
            <div className="flex justify-between gap-3"><dt>SMS store mode</dt><dd className="font-semibold text-ink">{smsStoreMode}</dd></div>
            <div className="flex justify-between gap-3"><dt>Cloud webhook last seen</dt><dd className="font-semibold text-ink">{formatTimestamp(latestWebhook?.createdAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Latest inbound keyword</dt><dd className="font-semibold text-ink">{safeInboundKeywordLabel(latestInboundMessage?.body)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last inbound SMS</dt><dd className="font-semibold text-ink">{formatTimestamp(latestInboundMessage?.timestamp)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last outbound SMS</dt><dd className="font-semibold text-ink">{formatTimestamp(latestOutboundMessage?.timestamp)}</dd></div>
          </dl>
        </details>

        {warnings.length > 0 ? (
          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={18} />
              Pilot safety warnings
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Enrollments</h2>
            <p className="text-sm text-slate-500">Read-only. No bulk messaging controls are exposed.</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Consent</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snapshot.enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td className="px-4 py-3 font-medium text-ink">{enrollment.name}</td>
                    <td className="px-4 py-3 text-slate-600">{redactPhone(enrollment.phone)}</td>
                    <td className="px-4 py-3 text-slate-600">{enrollment.email || "Not provided"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(enrollment.status)}`}>{enrollment.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatTimestamp(enrollment.consentTimestamp)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTimestamp(enrollment.updatedAt)}</td>
                  </tr>
                ))}
                {snapshot.enrollments.length === 0 ? (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No SMS enrollments recorded yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold tracking-[-.02em] text-ink">Recent messages</h2>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Consent</th>
                  <th className="px-4 py-3">Provider ID</th>
                  <th className="px-4 py-3">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snapshot.messages.slice(0, 100).map((message) => {
                  const consentStatus = enrollmentByPhone.get(message.phone)?.status;
                  return (
                    <tr key={message.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatTimestamp(message.timestamp)}</td>
                      <td className="px-4 py-3 font-medium text-ink">{message.direction}</td>
                      <td className="px-4 py-3 text-slate-600">{redactPhone(message.phone)}</td>
                      <td className="px-4 py-3 text-slate-600">{message.eventType}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(message.status)}`}>{message.status || "recorded"}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{consentStatus || "Not matched"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{shortId(message.providerId)}</td>
                      <td className="max-w-xl px-4 py-3 text-slate-600">{message.bodyPreview || "Delivery status update"}</td>
                    </tr>
                  );
                })}
                {snapshot.messages.length === 0 ? (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={8}>No SMS messages recorded yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <details className="mt-8 rounded-lg border border-line bg-white p-4">
          <summary className="cursor-pointer text-xl font-semibold tracking-[-.02em] text-ink">Recent webhook events ({(snapshot.webhookEvents ?? []).length})</summary>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Telnyx event ID</th>
                  <th className="px-4 py-3">Processed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(snapshot.webhookEvents ?? []).slice(0, 100).map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatTimestamp(event.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{event.eventType}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{shortId(event.telnyxEventId)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTimestamp(event.processedAt)}</td>
                  </tr>
                ))}
                {(snapshot.webhookEvents ?? []).length === 0 ? (
                  <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={4}>No Telnyx webhook events recorded yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </details>
    </div>
  );
}
