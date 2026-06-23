export function WorkerStatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

export function WorkerStatSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div style={{
        fontSize: 10,
        color: "var(--text-muted)",
        fontWeight: 700,
        letterSpacing: "1px",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}
