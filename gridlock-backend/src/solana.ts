import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { config, PROGRAM_IDS } from "./config.js";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function borshString(value: string): Buffer {
  const enc = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(enc.length);
  return Buffer.concat([len, enc]);
}

function borshBool(value: boolean): Buffer {
  return Buffer.from([value ? 1 : 0]);
}

function borshU32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function borshU64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function loadKeypair(): Keypair | null {
  try {
    const raw = readFileSync(config.routerKeypairPath, "utf8");
    const bytes = Uint8Array.from(JSON.parse(raw) as number[]);
    return Keypair.fromSecretKey(bytes);
  } catch (error) {
    console.log(`[solana] keypair load failed: ${error}`);
    return null;
  }
}

function derivePda(programId: string, seeds: Buffer[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, new PublicKey(programId));
}

export async function solanaRpc<T = unknown>(method: string, params: unknown[]): Promise<{ result?: T; error?: unknown }> {
  const resp = await fetch(config.solanaRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(3_000),
  });
  return resp.json() as Promise<{ result?: T; error?: unknown }>;
}

async function sendAnchorIx(programId: string, data: Buffer, accounts: AccountMeta[]): Promise<string | null> {
  if (!config.solanaRpcUrl || config.solanaRpcUrl.includes("localhost")) return null;
  try {
    const kp = loadKeypair();
    if (!kp) return null;

    const rpc = await solanaRpc<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
    const blockhash = rpc.result?.value.blockhash;
    if (!blockhash) return null;

    const ix = new TransactionInstruction({
      programId: new PublicKey(programId),
      keys: accounts,
      data,
    });

    const message = new TransactionMessage({
      payerKey: kp.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([kp]);

    const result = await solanaRpc<string>("sendTransaction", [
      Buffer.from(tx.serialize()).toString("base64"),
      { encoding: "base64", preflightCommitment: "confirmed" },
    ]);

    if (result.error) {
      console.log(`[solana] tx error:`, result.error);
      return null;
    }
    console.log(`[solana] tx: ${result.result}`);
    return result.result ?? null;
  } catch (error) {
    console.log(`[solana] send failed: ${error}`);
    return null;
  }
}

export async function anchorCommitReceipt(
  jobId: string,
  slaTier: string,
  ttftMs: number,
  tpotMs: number,
  slaMet: boolean,
  confidential: boolean,
): Promise<string | null> {
  if (!config.solanaRpcUrl || config.solanaRpcUrl.includes("localhost")) return null;
  try {
    const kp = loadKeypair();
    if (!kp) return null;
    const seed = Buffer.from(jobId.replace(/-/g, "").slice(0, 32));
    const [pda] = derivePda(PROGRAM_IDS.slaRegistry, [Buffer.from("receipt"), seed]);
    const data = Buffer.concat([
      anchorDiscriminator("commit_receipt"),
      borshString(jobId),
      borshString(slaTier),
      borshU32(ttftMs),
      borshU32(tpotMs),
      borshBool(slaMet),
      borshBool(confidential),
    ]);
    return sendAnchorIx(PROGRAM_IDS.slaRegistry, data, [
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]);
  } catch (error) {
    console.log(`[solana] commit_receipt: ${error}`);
    return null;
  }
}

export async function anchorSettleOrPenalize(jobId: string): Promise<string | null> {
  if (!config.solanaRpcUrl || config.solanaRpcUrl.includes("localhost")) return null;
  try {
    const kp = loadKeypair();
    if (!kp) return null;
    const seed = Buffer.from(jobId.replace(/-/g, "").slice(0, 32));
    const [receipt] = derivePda(PROGRAM_IDS.slaRegistry, [Buffer.from("receipt"), seed]);
    const [enforcer] = derivePda(PROGRAM_IDS.slaEnforcer, [Buffer.from("sla_enforcer")]);
    const data = Buffer.concat([anchorDiscriminator("settle_or_penalize"), borshString(jobId)]);
    return sendAnchorIx(PROGRAM_IDS.slaEnforcer, data, [
      { pubkey: enforcer, isSigner: false, isWritable: false },
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    ]);
  } catch (error) {
    console.log(`[solana] settle_or_penalize: ${error}`);
    return null;
  }
}

export async function anchorDistributeFees(jobId: string, amountLock: number): Promise<string | null> {
  if (!config.solanaRpcUrl || config.solanaRpcUrl.includes("localhost")) return null;
  try {
    const kp = loadKeypair();
    if (!kp) return null;
    const [collector] = derivePda(PROGRAM_IDS.feeCollector, [Buffer.from("fee_collector")]);
    const data = Buffer.concat([
      anchorDiscriminator("distribute_fees"),
      borshString(jobId),
      borshU64(amountLock),
    ]);
    return sendAnchorIx(PROGRAM_IDS.feeCollector, data, [
      { pubkey: collector, isSigner: false, isWritable: true },
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
    ]);
  } catch (error) {
    console.log(`[solana] distribute_fees: ${error}`);
    return null;
  }
}

export async function anchorRegisterWorker(
  operatorPubkey: string,
  role: string,
  hardwareTier: string,
  teeCapable: boolean,
): Promise<string | null> {
  if (!config.solanaRpcUrl || config.solanaRpcUrl.includes("localhost")) return null;
  try {
    const kp = loadKeypair();
    if (!kp) return null;
    const opKey = new PublicKey(operatorPubkey);
    const [workerPda] = derivePda(PROGRAM_IDS.providerRegistry, [Buffer.from("worker"), opKey.toBuffer()]);
    const data = Buffer.concat([
      anchorDiscriminator("register_worker"),
      borshString(role),
      borshString(hardwareTier),
      borshBool(teeCapable),
    ]);
    return sendAnchorIx(PROGRAM_IDS.providerRegistry, data, [
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: opKey, isSigner: false, isWritable: false },
      { pubkey: workerPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]);
  } catch (error) {
    console.log(`[solana] register_worker: ${error}`);
    return null;
  }
}

export async function getRecentSlots(): Promise<number> {
  try {
    const result = await solanaRpc<number>("getSlot", []);
    return result.result ?? 0;
  } catch {
    return 0;
  }
}
