"use client";
import { useEffect, useState } from "react";

export function ChartWrapper({ children, height = 160 }: { children: React.ReactNode; height?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <div style={{ height, minWidth: 0, width: "100%" }}>
      {mounted ? children : null}
    </div>
  );
}
