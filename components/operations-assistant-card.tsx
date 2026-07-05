import { AlertTriangle, Bot, Info, ShieldAlert } from "lucide-react";
import type { OperationsAssistantCard as OperationsAssistantCardData } from "@/lib/ai/operations-assistant-v2";

function priorityClassName(priority: OperationsAssistantCardData["priority"]) {
  if (priority === "blocker") return "border-rose-200 bg-rose-50 text-rose-950";
  if (priority === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-line bg-slate-50 text-slate-700";
}

function PriorityIcon({ priority }: { priority: OperationsAssistantCardData["priority"] }) {
  if (priority === "blocker") return <ShieldAlert size={17} />;
  if (priority === "warning") return <AlertTriangle size={17} />;
  return <Info size={17} />;
}

export function OperationsAssistantCard({ card }: { card: OperationsAssistantCardData }) {
  return (
    <article className={`rounded-lg border p-4 ${priorityClassName(card.priority)}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0"><PriorityIcon priority={card.priority} /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{card.label}</h3>
            <span className="inline-flex rounded-md bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 ring-1 ring-black/5">
              {card.priority}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6">{card.explanation}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink">{card.nextAction}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <Bot size={13} />
            Source: {card.source}
          </p>
        </div>
      </div>
    </article>
  );
}
