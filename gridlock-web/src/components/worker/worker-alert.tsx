import type { ReactNode } from "react";

type WorkerAlertVariant = "warning" | "error";

const VARIANT_STYLES: Record<WorkerAlertVariant, { border: string; background: string; color: string }> = {
  warning: {
    border: "1px solid rgba(255,160,0,0.25)",
    background: "rgba(255,160,0,0.04)",
    color: "var(--orange)",
  },
  error: {
    border: "1px solid rgba(255,68,68,0.3)",
    background: "rgba(255,68,68,0.06)",
    color: "var(--red)",
  },
};

export function WorkerAlert({
  variant,
  children,
}: {
  variant: WorkerAlertVariant;
  children: ReactNode;
}) {
  const style = VARIANT_STYLES[variant];
  return (
    <div style={{
      padding: 10,
      borderRadius: 8,
      border: style.border,
      background: style.background,
      fontSize: 12,
      color: style.color,
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}
