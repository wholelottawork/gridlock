"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { BrowserWorkerPanel } from "@/components/worker/browser-worker-panel";
import { DesktopWorkerPanel } from "@/components/worker/desktop-worker-panel";
import { NativeWorkerPanel } from "@/components/worker/native-worker-panel";
import { WorkerDashboard } from "@/components/worker/worker-dashboard";

type Tab = "earn" | "dashboard";

export default function WorkerPage() {
  const [tab, setTab] = useState<Tab>("earn");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Worker</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700, maxWidth: 640 }}>
            Run inference on the network and earn $LOCK. Choose browser, desktop, or native worker for your setup.
          </p>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {([
          ["earn", "Start Earning"],
          ["dashboard", "Dashboard"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`tab-btn${tab === t ? " active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "earn" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <BrowserWorkerPanel />
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
            alignItems: "stretch",
          }}>
            <DesktopWorkerPanel />
            <NativeWorkerPanel />
          </div>
        </div>
      ) : (
        <WorkerDashboard />
      )}
    </motion.div>
  );
}
