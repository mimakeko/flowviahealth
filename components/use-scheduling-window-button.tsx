"use client";

import { Clock3 } from "lucide-react";
import { useCallback, useEffect } from "react";

type UseSchedulingWindowButtonProps = Readonly<{
  fieldName?: string;
  value: string;
}>;

export function UseSchedulingWindowButton({ fieldName = "scheduledAt", value }: UseSchedulingWindowButtonProps) {
  useEffect(() => {
    document.body.dataset.flowviaSchedulingWindowReady = "true";
  }, []);

  const useWindow = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`);
    if (!input) return;

    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }, [fieldName, value]);

  return (
    <button
      type="button"
      data-scheduling-window-value={value}
      onClick={useWindow}
      onPointerDown={useWindow}
      className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-blue/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue transition hover:bg-ice"
    >
      <Clock3 size={14} />
      Use this window
    </button>
  );
}
