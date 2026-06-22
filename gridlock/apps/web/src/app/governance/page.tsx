"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";

type ProposalStatus = "active" | "passed" | "failed" | "queued";
type VoteChoice = "for" | "against" | "abstain";

interface Proposal {
  id: number;
  title: string;
  description: string;
  status: ProposalStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorum: number;
  endsAt: string;
  category: "fee" | "sla" | "emission" | "upgrade" | "treasury";
  author: string;
  discussion: string;
}

const PROPOSALS: Proposal[] = [
  {
    id: 7,
    title: "GIP-7: Reduce Batch penalty multiplier from 0.25× to 0.15×",
    description: "The 0.25× penalty on Batch-tier SLA misses creates excessive risk for high-volume, latency-tolerant workloads. This proposal reduces it to 0.15× to attract more batch inference demand without reducing Realtime/Standard incentives.",
    status: "active",
    votesFor: 12_840_000,
    votesAgainst: 3_200_000,
    votesAbstain: 890_000,
    quorum: 10_000_000,
    endsAt: "3d 14h",
    category: "sla",
    author: "7xKm…b3Rq",
    discussion: "https://forum.gridlock.network/t/gip-7",
  },
  {
    id: 6,
    title: "GIP-6: Increase staker revenue share from 60% to 65%",
    description: "Increase the staker revenue share in the fee distribution split from 60% to 65%, funded by reducing the treasury allocation from 10% to 5%. This improves staking APY and aligns long-term token holders with network growth.",
    status: "queued",
    votesFor: 24_100_000,
    votesAgainst: 6_800_000,
    votesAbstain: 1_200_000,
    quorum: 10_000_000,
    endsAt: "Executing in 48h",
    category: "fee",
    author: "9mPw…c4Rt",
    discussion: "https://forum.gridlock.network/t/gip-6",
  },
  {
    id: 5,
    title: "GIP-5: Add H100 NVL hardware tier to ProviderRegistry",
    description: "The ProviderRegistry HardwareTier enum currently maxes at Enterprise (H100 SXM). This proposal adds a new NVL tier for H100 NVL 94GB nodes, unlocking premium job routing for memory-intensive models like Llama-3.1-405B.",
    status: "passed",
    votesFor: 31_500_000,
    votesAgainst: 2_100_000,
    votesAbstain: 400_000,
    quorum: 10_000_000,
    endsAt: "Ended",
    category: "upgrade",
    author: "3bYv…w9Kq",
    discussion: "https://forum.gridlock.network/t/gip-5",
  },
  {
    id: 4,
    title: "GIP-4: Reduce heartbeat timeout from 120s to 90s",
    description: "Workers that go dark mid-serving are currently given 120 seconds before being AutoGated. A 90-second timeout improves SLA guarantees for Realtime customers at the cost of stricter reliability requirements for workers.",
    status: "failed",
    votesFor: 8_200_000,
    votesAgainst: 18_700_000,
    votesAbstain: 2_100_000,
    quorum: 10_000_000,
    endsAt: "Ended",
    category: "sla",
    author: "5qMn…r7Tw",
    discussion: "https://forum.gridlock.network/t/gip-4",
  },
];

const NETWORK_PARAMS = [
  { param: "Batch penalty multiplier",      value: "0.25×",      controlled: "GIP-7 (pending)" },
  { param: "Standard penalty multiplier",   value: "1.0×",       controlled: "Governance vote" },
  { param: "Realtime penalty multiplier",   value: "2.0×",       controlled: "Governance vote" },
  { param: "Staker revenue share",          value: "60%",        controlled: "GIP-6 (queued)" },
  { param: "Worker revenue share",          value: "20%",        controlled: "Governance vote" },
  { param: "Burn share",                    value: "10%",        controlled: "Immutable" },
  { param: "Treasury share",               value: "10%",        controlled: "GIP-6 (queued)" },
  { param: "Heartbeat timeout",            value: "120s",       controlled: "Governance vote" },
  { param: "Transfer hook fee",            value: "0.1%",       controlled: "Governance vote" },
  { param: "Interest bearing APY",         value: "8%",         controlled: "Governance vote" },
  { param: "Quorum threshold",             value: "10M LOCK",   controlled: "Governance vote" },
  { param: "Passing threshold",            value: "60%",        controlled: "Governance vote" },
  { param: "Time-lock delay",              value: "48h",        controlled: "Governance vote" },
];

function StatusBadge({ status }: { status: ProposalStatus }) {
  const config: Record<ProposalStatus, { color: string; bg: string; label: string }> = {
    active:  { color: "var(--text-primary)",    bg: "rgba(255,255,255,0.06)", label: "ACTIVE" },
    passed:  { color: "var(--orange)",         bg: "var(--orange-dim)",      label: "PASSED" },
    failed:  { color: "var(--text-secondary)",  bg: "rgba(255,255,255,0.06)", label: "FAILED" },
    queued:  { color: "var(--text-secondary)", bg: "rgba(255,255,255,0.05)", label: "QUEUED" },
  };
  const c = config[status];
  return (
    <span style={{ padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 800, color: c.color, background: c.bg, border: `1px solid ${c.color}40`, letterSpacing: "0.5px" }}>
      {c.label}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: Proposal["category"] }) {
  const colors: Record<string, string> = { fee: "var(--orange)", sla: "var(--green)", emission: "var(--yellow)", upgrade: "var(--purple)", treasury: "var(--text-secondary)" };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: colors[cat] ?? "var(--text-muted)", padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-2)", letterSpacing: "0.5px" }}>
      {cat.toUpperCase()}
    </span>
  );
}

function VoteBar({ proposal }: { proposal: Proposal }) {
  const total = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const forPct  = total ? (proposal.votesFor / total) * 100 : 0;
  const agPct   = total ? (proposal.votesAgainst / total) * 100 : 0;
  const abPct   = total ? (proposal.votesAbstain / total) * 100 : 0;
  const quorumPct = Math.min((total / proposal.quorum) * 100, 100);
  const quorumMet = total >= proposal.quorum;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", height: 8 }}>
        <div style={{ flex: forPct, background: "var(--green)", transition: "flex 0.3s" }} />
        <div style={{ flex: agPct, background: "var(--red)", transition: "flex 0.3s" }} />
        <div style={{ flex: abPct, background: "var(--text-muted)", opacity: 0.3, transition: "flex 0.3s" }} />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
        <span style={{ color: "var(--green)", fontWeight: 700 }}>For {forPct.toFixed(1)}%</span>
        <span style={{ color: "var(--red)", fontWeight: 700 }}>Against {agPct.toFixed(1)}%</span>
        <span style={{ color: "var(--text-muted)" }}>Abstain {abPct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function GovernancePage() {
  const { connected, publicKey } = useWallet();
  const [votes, setVotes] = useState<Record<number, VoteChoice>>({});
  const [expanded, setExpanded] = useState<number | null>(7);

  const votingPower = 25_000; // mock: staked LOCK balance

  function handleVote(proposalId: number, choice: VoteChoice) {
    if (!connected) return;
    setVotes((prev) => ({ ...prev, [proposalId]: choice }));
  }

  const activeProposals = PROPOSALS.filter((p) => p.status === "active" || p.status === "queued");
  const pastProposals   = PROPOSALS.filter((p) => p.status === "passed" || p.status === "failed");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{ maxWidth: 1024, margin: "0 auto", padding: "32px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Governance</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
          Vote on network parameters with staked LOCK. Proposals pass at 60% with 10M LOCK quorum.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "YOUR VOTING POWER",    value: `${votingPower.toLocaleString()} LOCK`,  accent: "var(--orange)" },
          { label: "ACTIVE PROPOSALS",     value: activeProposals.length.toString(),        accent: "var(--text-primary)" },
          { label: "QUORUM THRESHOLD",     value: "10M LOCK",                               accent: "var(--text-primary)" },
          { label: "TIME-LOCK DELAY",      value: "48h",                                    accent: "var(--text-secondary)" },
        ].map((s) => (
          <div key={s.label} className="card">
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {!connected && (
        <div style={{ background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: "var(--orange)" }}>
          Connect your wallet to vote. Your voting power equals your staked LOCK balance.
        </div>
      )}

      {/* Active proposals */}
      <div style={{ marginBottom: 8, fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>ACTIVE &amp; QUEUED ({activeProposals.length})</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {activeProposals.map((p) => {
          const myVote = votes[p.id];
          const isExpanded = expanded === p.id;
          return (
            <div key={p.id} className="card" style={{ border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : p.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <StatusBadge status={p.status} />
                    <CategoryBadge cat={p.category} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", fontWeight: 700 }}>
                      {p.status === "active" ? `Ends in ${p.endsAt}` : p.endsAt}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                    {p.title}
                  </div>
                  {isExpanded && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14, fontWeight: 700 }}>
                      {p.description}
                    </div>
                  )}
                  <VoteBar proposal={p} />
                </div>

                {/* Vote buttons */}
                {p.status === "active" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, minWidth: 100 }}>
                    {(["for", "against", "abstain"] as VoteChoice[]).map((choice) => {
                      const isMyVote = myVote === choice;
                      const colors: Record<VoteChoice, string> = { for: "var(--green)", against: "var(--red)", abstain: "var(--text-muted)" };
                      return (
                        <button
                          key={choice}
                          onClick={() => handleVote(p.id, choice)}
                          disabled={!connected}
                          style={{
                            padding: "6px 12px", borderRadius: 5, cursor: connected ? "pointer" : "not-allowed",
                            border: "1px solid #FFFFFF",
                            background: isMyVote ? "#FFFFFF" : "rgba(255,255,255,0.06)",
                            color: isMyVote ? "#000000" : "#FFFFFF",
                            fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                            transition: "all 0.12s",
                            opacity: connected ? 1 : 0.5,
                          }}
                        >
                          {isMyVote ? "✓ " : ""}{choice.charAt(0).toUpperCase() + choice.slice(1)}
                        </button>
                      );
                    })}
                    {myVote && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                        {votingPower.toLocaleString()} LOCK cast
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Network parameters */}
      <div style={{ marginBottom: 8, fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>NETWORK PARAMETERS</div>
      <div className="card" style={{ marginBottom: 28, padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Current Value</th>
              <th>Controlled By</th>
            </tr>
          </thead>
          <tbody>
            {NETWORK_PARAMS.map((row) => (
              <tr key={row.param}>
                <td style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{row.param}</td>
                <td style={{ fontWeight: 800, color: "var(--orange)", fontFamily: "monospace" }}>{row.value}</td>
                <td style={{ fontSize: 11, color: row.controlled.includes("pending") || row.controlled.includes("queued") ? "var(--yellow)" : row.controlled === "Immutable" ? "var(--text-muted)" : "var(--text-secondary)" }}>
                  {row.controlled}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Past proposals */}
      <div style={{ marginBottom: 8, fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>PAST PROPOSALS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pastProposals.map((p) => (
          <div key={p.id} className="card" style={{ opacity: 0.8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusBadge status={p.status} />
              <CategoryBadge cat={p.category} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", flex: 1 }}>{p.title}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                For {((p.votesFor / (p.votesFor + p.votesAgainst + p.votesAbstain)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: "16px 20px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text-secondary)" }}>How governance works:</strong> Stake LOCK to gain voting power (1 LOCK = 1 vote). Proposals need 10M LOCK quorum and 60% approval to pass. Passed proposals enter a 48-hour time-lock before execution by the GovernanceProgram on-chain. Rejected proposals may be resubmitted after 30 days.
        </div>
      </div>
    </motion.div>
  );
}
