/** Production download URLs for the Gridlock Worker desktop app (electron-builder). */
const REPO = process.env.NEXT_PUBLIC_WORKER_RELEASE_REPO ?? "wholelottawork/gridlock";
const TAG = process.env.NEXT_PUBLIC_WORKER_RELEASE_TAG ?? "latest";

export const WORKER_APP_VERSION = process.env.NEXT_PUBLIC_WORKER_VERSION ?? "0.1.0";

export const NATIVE_WORKER_PACKAGE = process.env.NEXT_PUBLIC_NATIVE_WORKER_PACKAGE ?? "@gridlock/native-worker";

/** Local install (package not on npm yet). After `npm install && npm run build`: */
export function nativeWorkerLocalCommand(wallet: string): string {
  return `gridlock-native-worker --wallet ${wallet}`;
}

export function nativeWorkerSetupCommand(): string {
  return "npm install && npm run build && npm link";
}

/** After publish to npm */
export function nativeWorkerNpxCommand(wallet: string): string {
  return `npx ${NATIVE_WORKER_PACKAGE} --wallet ${wallet}`;
}

export function nativeWorkerCommand(wallet: string): string {
  return nativeWorkerLocalCommand(wallet);
}

export const VLLM_SERVE_COMMAND =
  "vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000 --tensor-parallel-size 1";

export const OLLAMA_PULL_COMMAND = "ollama pull llama3.1:8b";

/** Enable dev TEE attestation (H100 CC required for production). Windows PowerShell prefix. */
export function nativeWorkerTeeCommand(wallet: string): string {
  return `$env:GRIDLOCK_TEE_CAPABLE="true"; ${nativeWorkerLocalCommand(wallet)}`;
}

function downloadUrl(filename: string): string {
  const override = process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_BASE;
  if (override) return `${override.replace(/\/$/, "")}/${filename}`;
  return `https://github.com/${REPO}/releases/download/${TAG}/${filename}`;
}

const WIN_INSTALLER = `Gridlock-Worker-Setup-${WORKER_APP_VERSION}.exe`;
const MAC_INSTALLER = `Gridlock-Worker-${WORKER_APP_VERSION}.dmg`;
const LINUX_INSTALLER = `Gridlock-Worker-${WORKER_APP_VERSION}.AppImage`;

export const DESKTOP_WORKER_DOWNLOADS = {
  windows: {
    label: "Windows",
    filename: WIN_INSTALLER,
    url: downloadUrl(WIN_INSTALLER),
  },
  mac: {
    label: "macOS",
    filename: MAC_INSTALLER,
    url: downloadUrl(MAC_INSTALLER),
  },
  linux: {
    label: "Linux",
    filename: LINUX_INSTALLER,
    url: downloadUrl(LINUX_INSTALLER),
  },
} as const;

export type DesktopWorkerPlatform = keyof typeof DESKTOP_WORKER_DOWNLOADS;

export function detectDesktopPlatform(): DesktopWorkerPlatform {
  if (typeof navigator === "undefined") return "windows";
  const p = (navigator.platform || navigator.userAgent || "").toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("mac")) return "mac";
  if (p.includes("linux")) return "linux";
  return "windows";
}
