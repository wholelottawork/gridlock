"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  createApiKey,
  fetchApiKeysWithSession,
  resolveApiBaseUrl,
  revokeApiKey,
  type ApiKeyPublic,
} from "@/lib/api-client";
import {
  getApiKeySecret,
  removeApiKeySecret,
  saveApiKeySecret,
  setActiveApiKeyId,
} from "@/lib/api-keys-storage";
import {
  getCachedApiKeys,
  invalidateApiKeysCache,
  setCachedApiKeys,
} from "@/lib/api-keys-list-cache";
import { useWalletSession } from "@/context/wallet-session-context";
import { INSECURE_KEY_MANAGEMENT, signGridlockKeysAction } from "@/lib/wallet-auth";
import { clearWalletSession, isSessionAuthError } from "@/lib/wallet-session";

const SLA_OPTIONS = ["realtime", "standard", "batch", "confidential"] as const;

type Props = {
  onKeysChange?: () => void;
};

export function ApiKeysPanel({ onKeysChange }: Props) {
  const { publicKey, connected, signMessage } = useWallet();
  const { ensureSession } = useWalletSession();
  const wallet = publicKey?.toBase58() ?? null;

  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"prod" | "dev">("prod");
  const [newSla, setNewSla] = useState<(typeof SLA_OPTIONS)[number]>("standard");
  const [newTee, setNewTee] = useState(false);

  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const signAuth = useCallback(
    async (action: string) => {
      if (!wallet) throw new Error("Connect your wallet first");
      if (INSECURE_KEY_MANAGEMENT) return { wallet, timestampMs: Date.now(), signatureBase64: "" };
      if (!signMessage) throw new Error("Your wallet does not support message signing");
      return signGridlockKeysAction(signMessage, wallet, action);
    },
    [wallet, signMessage],
  );

  const loadKeys = useCallback(async (opts?: { background?: boolean }) => {
    if (!wallet) {
      setKeys([]);
      setLoaded(false);
      return;
    }
    const cached = getCachedApiKeys(wallet);
    if (!opts?.background && !cached) setLoading(true);
    setError(null);
    try {
      let token = await ensureSession();
      let res;
      try {
        res = await fetchApiKeysWithSession(wallet, token);
      } catch (e) {
        if (isSessionAuthError(e)) {
          clearWalletSession();
          token = await ensureSession();
          res = await fetchApiKeysWithSession(wallet, token);
        } else {
          throw e;
        }
      }
      setKeys(res.keys);
      setCachedApiKeys(wallet, res.keys);
      setLoaded(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load API keys";
      if (!cached) {
        setError(message);
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet, ensureSession]);

  useEffect(() => {
    if (!wallet) {
      setKeys([]);
      setLoaded(false);
      setError(null);
      return;
    }
    if (!INSECURE_KEY_MANAGEMENT && !signMessage) return;

    const cached = getCachedApiKeys(wallet);
    if (cached) {
      setKeys(cached);
      setLoaded(true);
      void loadKeys({ background: true });
      return;
    }
    void loadKeys();
  }, [wallet, signMessage, loadKeys]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy("create");
    setError(null);
    try {
      const auth = await signAuth("create");
      const res = await createApiKey(auth, {
        name: newName.trim(),
        kind: newKind,
        default_sla: newSla,
        tee_required: newTee,
      });
      saveApiKeySecret(res.key.id, res.secret);
      setActiveApiKeyId(res.key.id);
      setRevealedSecret(res.secret);
      setShowCreate(false);
      setNewName("");
      invalidateApiKeysCache(wallet ?? undefined);
      await loadKeys();
      onKeysChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? This cannot be undone.`)) return;
    setBusy(id);
    setError(null);
    try {
      const auth = await signAuth("revoke");
      await revokeApiKey(auth, id);
      removeApiKeySecret(id);
      invalidateApiKeysCache(wallet ?? undefined);
      await loadKeys();
      onKeysChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy(key: ApiKeyPublic) {
    const secret = getApiKeySecret(key.id);
    const text = secret ?? key.key_prefix;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function handleUseInPlayground(id: string) {
    setActiveApiKeyId(id);
    onKeysChange?.();
  }

  const baseUrl = resolveApiBaseUrl();
  const sampleKey = revealedSecret ?? keys.find((k) => getApiKeySecret(k.id))?.key_prefix ?? "gk-prod-your-key";

  if (!connected || !wallet) {
    return (
      <div className="card">
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 12 }}>
          API KEYS
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
          Connect your Solana wallet (top right) to create and manage API keys for the Gridlock inference API.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>API KEYS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={() => void loadKeys()}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
              {wallet.slice(0, 4)}…{wallet.slice(-4)}
            </div>
          </div>
        </div>

        {INSECURE_KEY_MANAGEMENT && (
          <div style={{
            marginBottom: 12, padding: "10px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: "rgba(255,160,0,0.08)", border: "1px solid rgba(255,160,0,0.25)", color: "var(--orange)",
          }}>
            Dev mode: wallet signatures disabled (GRIDLOCK_INSECURE_KEY_MANAGEMENT)
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: 12, padding: "10px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.25)", color: "var(--red)",
          }}>
            {error}
          </div>
        )}

        {revealedSecret && (
          <div style={{
            marginBottom: 12, padding: "14px 16px", borderRadius: 8,
            background: "rgba(0,220,100,0.06)", border: "1px solid rgba(0,220,100,0.25)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>
              New key created — copy it now
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", marginBottom: 10 }}>
              {revealedSecret}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: "6px 14px" }}
                onClick={() => void navigator.clipboard.writeText(revealedSecret)}
              >
                Copy secret
              </button>
              <button
                type="button"
                style={{
                  fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-secondary)",
                }}
                onClick={() => setRevealedSecret(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!loaded ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>Loading keys…</div>
        ) : keys.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0 16px", lineHeight: 1.6 }}>
            No API keys for this wallet yet. Create one to authenticate chat requests.
            <div style={{ marginTop: 8, fontSize: 11 }}>
              Keys are scoped to the connected wallet ({wallet.slice(0, 4)}…{wallet.slice(-4)}).
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
            {keys.map((k) => (
              <div
                key={k.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                  background: "var(--bg-3)", borderRadius: 6, padding: "12px 16px",
                }}
              >
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{k.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                    {getApiKeySecret(k.id) ? `${k.key_prefix} (saved locally)` : k.key_prefix}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {k.request_count.toLocaleString()} req
                </div>
                <span style={{
                  padding: "2px 8px", borderRadius: 3, background: "var(--orange-dim)",
                  border: "1px solid var(--orange-border)", color: "var(--orange)", fontSize: 10, fontWeight: 700,
                }}>
                  {k.default_sla.toUpperCase()}
                </span>
                {k.tee_required && (
                  <span style={{
                    padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.05)",
                    border: "1px solid var(--border-2)", color: "var(--text-secondary)", fontSize: 10, fontWeight: 700,
                  }}>
                    TEE
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(k)}
                  style={{
                    background: "var(--bg-4)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                    borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  }}
                >
                  {copiedId === k.id ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => handleUseInPlayground(k.id)}
                  style={{
                    background: "var(--bg-4)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                    borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  }}
                >
                  Use
                </button>
                <button
                  type="button"
                  disabled={busy === k.id}
                  onClick={() => void handleRevoke(k.id, k.name)}
                  style={{
                    background: "transparent", border: "1px solid rgba(255,60,60,0.35)", color: "var(--red)",
                    borderRadius: 5, padding: "4px 10px", cursor: busy === k.id ? "wait" : "pointer", fontSize: 11, fontWeight: 600,
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}

        {!showCreate ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 8, width: "fit-content", fontSize: 13 }}
            onClick={() => setShowCreate(true)}
          >
            Create New Key
          </button>
        ) : (
          <div style={{
            marginTop: 8, padding: 16, borderRadius: 8, background: "var(--bg-3)", border: "1px solid var(--border)",
            display: "flex", flexDirection: "column", gap: 12, maxWidth: 420,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>New API key</div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>NAME</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Production"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
                  background: "var(--bg-0)", border: "1px solid var(--border)", color: "var(--text-primary)",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>KIND</div>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as "prod" | "dev")}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
                    background: "var(--bg-0)", border: "1px solid var(--border)", color: "var(--text-primary)",
                  }}
                >
                  <option value="prod">Production</option>
                  <option value="dev">Development</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>DEFAULT SLA</div>
                <select
                  value={newSla}
                  onChange={(e) => setNewSla(e.target.value as (typeof SLA_OPTIONS)[number])}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
                    background: "var(--bg-0)", border: "1px solid var(--border)", color: "var(--text-primary)",
                  }}
                >
                  {SLA_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={newTee} onChange={(e) => setNewTee(e.target.checked)} />
              Require TEE / confidential requests only
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === "create" || !newName.trim()}
                onClick={() => void handleCreate()}
                style={{ fontSize: 13 }}
              >
                {busy === "create" ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{
                  fontSize: 13, padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 14 }}>
          QUICKSTART
        </div>
        <div style={{
          background: "var(--bg-0)", borderRadius: 6, padding: "16px",
          fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "var(--text-secondary)",
        }}>
          <div style={{ color: "var(--text-muted)" }}>npm install openai</div>
          <br />
          <div><span style={{ color: "#888" }}>import</span> OpenAI <span style={{ color: "#888" }}>from</span> <span style={{ color: "#aaa" }}>&apos;openai&apos;</span></div>
          <div>
            <span style={{ color: "#888" }}>const</span> client ={" "}
            <span style={{ color: "#888" }}>new</span>{" "}
            <span style={{ color: "#fff" }}>OpenAI</span>
            {`({ baseURL: '${baseUrl}/v1', apiKey: '${sampleKey.slice(0, 20)}…' })`}
          </div>
          <div><span style={{ color: "#888" }}>const</span> res = <span style={{ color: "#888" }}>await</span> client.chat.completions.<span style={{ color: "#fff" }}>create</span>{"({"}</div>
          <div style={{ paddingLeft: 16 }}>model: <span style={{ color: "#aaa" }}>&apos;llama-3.1-8b-instant&apos;</span>,</div>
          <div style={{ paddingLeft: 16 }}>messages: [{"{"} role: <span style={{ color: "#aaa" }}>&apos;user&apos;</span>, content: <span style={{ color: "#aaa" }}>&apos;Hello&apos;</span> {"}"}],</div>
          <div style={{ paddingLeft: 16 }}>gridlock: {"{"} sla: <span style={{ color: "#aaa" }}>&apos;realtime&apos;</span> {"}"}</div>
          <div>{"}"}</div>
          <br />
          <div style={{ color: "var(--text-muted)" }}>{"// res.gridlock = { ttft_ms: 187, sla_met: true, ... }"}</div>
        </div>
      </div>
    </div>
  );
}
