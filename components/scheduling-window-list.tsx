import type { SuggestedSchedulingWindow } from "@/lib/pilot/scheduling-intelligence";
import { UseSchedulingWindowButton } from "@/components/use-scheduling-window-button";

type SchedulingWindowListProps = Readonly<{
  enableUseWindowAction?: boolean;
  windows: readonly SuggestedSchedulingWindow[];
}>;

export function SchedulingWindowList({ enableUseWindowAction = false, windows }: SchedulingWindowListProps) {
  const visibleWindows = windows.slice(0, 4);
  const additionalWindows = windows.slice(4);
  const renderWindow = (window: SuggestedSchedulingWindow) => (
    <div key={window.localInputValue} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
      <p className="font-semibold text-ink">{window.label}</p>
      <p className="mt-1 text-xs text-slate-500">Review before creating a visit. No auto-submit.</p>
      {enableUseWindowAction ? <UseSchedulingWindowButton value={window.localInputValue} /> : null}
    </div>
  );

  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-ink">Suggested business-day windows</h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">No autonomous scheduling</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {visibleWindows.map(renderWindow)}
        {windows.length === 0 ? <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">No conflict-free deterministic windows found in the next fake pilot business days.</p> : null}
      </div>
      {additionalWindows.length > 0 ? (
        <details className="mt-3 rounded-md border border-line bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Show {additionalWindows.length} more suggested windows</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{additionalWindows.map(renderWindow)}</div>
        </details>
      ) : null}
    </div>
  );
}
