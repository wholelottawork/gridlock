/** Production download URLs for the Gridlock Worker desktop app (electron-builder). */
const REPO = process.env.NEXT_PUBLIC_WORKER_RELEASE_REPO ?? "wholelottawork/gridlock";

export const WORKER_APP_VERSION = process.env.NEXT_PUBLIC_WORKER_VERSION ?? "0.1.3";

/** GitHub release tag, e.g. worker-v0.1.0 */
const TAG =
  process.env.NEXT_PUBLIC_WORKER_RELEASE_TAG ?? `worker-v${WORKER_APP_VERSION}`;

export const WORKER_RELEASES_URL = `https://github.com/${REPO}/releases`;

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

/** Windows installer metadata for the /download marketing page. */
export const WINDOWS_WORKER_DOWNLOAD = {
  label: "Windows",
  version: `v${WORKER_APP_VERSION}`,
  filename: WIN_INSTALLER,
  url: downloadUrl(WIN_INSTALLER),
  size: process.env.NEXT_PUBLIC_WORKER_WINDOWS_SIZE ?? "94 MB",
  arch: "x64",
  note: "Windows 10 / 11",
} as const;

export const MAC_WORKER_DOWNLOAD = {
  label: "macOS",
  version: `v${WORKER_APP_VERSION}`,
  filename: MAC_INSTALLER,
  url: downloadUrl(MAC_INSTALLER),
  size: process.env.NEXT_PUBLIC_WORKER_MAC_SIZE ?? "112 MB",
  arch: "Apple Silicon / Intel",
  note: "macOS 12+",
} as const;

export const LINUX_WORKER_DOWNLOAD = {
  label: "Linux",
  version: `v${WORKER_APP_VERSION}`,
  filename: LINUX_INSTALLER,
  url: downloadUrl(LINUX_INSTALLER),
  size: process.env.NEXT_PUBLIC_WORKER_LINUX_SIZE ?? "108 MB",
  arch: "x64",
  note: "AppImage · Ubuntu 22.04+",
} as const;

export const DESKTOP_WORKER_DOWNLOADS_LIST = [
  WINDOWS_WORKER_DOWNLOAD,
  MAC_WORKER_DOWNLOAD,
  LINUX_WORKER_DOWNLOAD,
] as const;

export type WorkerDownloadMeta = (typeof DESKTOP_WORKER_DOWNLOADS_LIST)[number];

export const DESKTOP_WORKER_DOWNLOADS = {
  windows: {
    label: WINDOWS_WORKER_DOWNLOAD.label,
    filename: WINDOWS_WORKER_DOWNLOAD.filename,
    url: WINDOWS_WORKER_DOWNLOAD.url,
  },
  mac: {
    label: MAC_WORKER_DOWNLOAD.label,
    filename: MAC_WORKER_DOWNLOAD.filename,
    url: MAC_WORKER_DOWNLOAD.url,
  },
  linux: {
    label: LINUX_WORKER_DOWNLOAD.label,
    filename: LINUX_WORKER_DOWNLOAD.filename,
    url: LINUX_WORKER_DOWNLOAD.url,
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
