"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

type PendingSubmitButtonProps = Readonly<{
  children: ReactNode;
  className: string;
  name?: string;
  pendingLabel: string;
  value?: string;
}>;

export function PendingSubmitButton({ children, className, name, pendingLabel, value }: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" name={name} value={value} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
