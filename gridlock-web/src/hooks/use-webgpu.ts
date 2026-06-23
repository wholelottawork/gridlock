"use client";
import { useEffect, useState } from "react";

export interface WebGPUInfo {
  supported: boolean;
  gpuName: string | null;
  estimatedVramGb: number | null;
}

export function useWebGPU(): WebGPUInfo & { loading: boolean } {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<WebGPUInfo>({
    supported: false,
    gpuName: null,
    estimatedVramGb: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        if (!cancelled) {
          setInfo({ supported: false, gpuName: null, estimatedVramGb: null });
          setLoading(false);
        }
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = navigator as Navigator & { gpu?: { requestAdapter: (opts?: object) => Promise<any> } };
        const adapter = await nav.gpu?.requestAdapter({
          powerPreference: "high-performance",
        });
        if (!adapter) {
          if (!cancelled) setInfo({ supported: false, gpuName: null, estimatedVramGb: null });
          return;
        }

        const adapterInfo = await adapter.requestAdapterInfo?.();
        const gpuName = adapterInfo?.device || adapterInfo?.description || "WebGPU GPU";

        const maxBuffer = adapter.limits?.maxBufferSize ?? 0;
        const estimated = Math.round((maxBuffer / (1024 ** 3)) * 4 * 10) / 10;
        const vramGb = Math.max(1, Math.min(48, estimated));

        if (!cancelled) {
          setInfo({ supported: true, gpuName, estimatedVramGb: vramGb });
        }
      } catch {
        if (!cancelled) setInfo({ supported: false, gpuName: null, estimatedVramGb: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, []);

  return { ...info, loading };
}
