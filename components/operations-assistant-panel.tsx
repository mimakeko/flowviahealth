import { Bot, ShieldCheck } from "lucide-react";
import type { OperationsAssistantSuggestion } from "@/lib/ai/schemas";

type OperationsAssistantStatus = Readonly<{
  auditOnly: boolean;
  enabled: boolean;
  modeLabel: string;
  noPhiMode: boolean;
  provider: string;
  realProviderCallsEnabled: boolean;
}>;

type OperationsAssistantPanelProps = Readonly<{
  status: OperationsAssistantStatus;
  suggestion: OperationsAssistantSuggestion;
}>;

function briefingItems(suggestion: OperationsAssistantSuggestion) {
  const items = suggestion.data.items;
  return Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : [];
}

export function OperationsAssistantPanel({ status, suggestion }: OperationsAssistantPanelProps) {
  const items = briefingItems(suggestion);

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-[0_10px_30px_rgba(10,37,64,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue">
            <Bot size={18} />
            Operations Assistant — {status.modeLabel}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{suggestion.summary}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
          <ShieldCheck size={14} />
          Audit only
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>

      <dl className="mt-4 grid gap-2 border-t border-line pt-4 text-xs text-slate-600 sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt>Provider</dt><dd className="font-semibold text-ink">{status.provider}</dd></div>
        <div className="flex justify-between gap-3"><dt>External calls</dt><dd className="font-semibold text-ink">{status.realProviderCallsEnabled ? "Enabled" : "Off"}</dd></div>
        <div className="flex justify-between gap-3"><dt>No-PHI mode</dt><dd className="font-semibold text-ink">{status.noPhiMode ? "On" : "Off"}</dd></div>
        <div className="flex justify-between gap-3"><dt>DB/SMS mutation</dt><dd className="font-semibold text-ink">Blocked</dd></div>
      </dl>
    </section>
  );
}
