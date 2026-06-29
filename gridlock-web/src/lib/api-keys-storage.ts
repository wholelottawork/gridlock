const STORAGE_KEY = "gridlock:api-key-secrets:v1";
const ACTIVE_KEY = "gridlock:active-api-key-id:v1";

type SecretStore = Record<string, string>;

function readSecrets(): SecretStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SecretStore) : {};
  } catch {
    return {};
  }
}

function writeSecrets(store: SecretStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function saveApiKeySecret(keyId: string, secret: string): void {
  const store = readSecrets();
  store[keyId] = secret;
  writeSecrets(store);
}

export function getApiKeySecret(keyId: string): string | null {
  return readSecrets()[keyId] ?? null;
}

export function removeApiKeySecret(keyId: string): void {
  const store = readSecrets();
  delete store[keyId];
  writeSecrets(store);
}

export function getActiveApiKeyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveApiKeyId(keyId: string | null): void {
  if (keyId) localStorage.setItem(ACTIVE_KEY, keyId);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveApiKeySecret(): string | null {
  const id = getActiveApiKeyId();
  if (!id) return null;
  return getApiKeySecret(id);
}

export function listStoredKeyIds(): string[] {
  return Object.keys(readSecrets());
}
