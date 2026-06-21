/**
 * Create the LOCK Token-2022 mint with three extensions:
 *   - PermanentDelegate (SLAEnforcer PDA) — auto-transfer penalties
 *   - TransferHook (FeeCollector) — 0.1% hook on every transfer
 *   - InterestBearing (8% APY) — staking rewards accrue on-chain
 *
 * Usage:
 *   npx ts-node scripts/create-lock-mint.ts --cluster devnet
 *
 * Prerequisites:
 *   npm install @solana/web3.js @solana/spl-token ts-node typescript
 *   solana-keygen new -o ~/.config/solana/id.json  (if not exists)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeInterestBearingMintInstruction,
  ExtensionType,
  getMintLen,
  createMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ── Config ─────────────────────────────────────────────────────────────────────

const CLUSTER = (process.argv.find((a) => a.startsWith("--cluster="))?.split("=")[1] ?? "devnet") as
  | "devnet"
  | "mainnet-beta"
  | "localnet";

const HELIUS_DEVNET = "https://devnet.helius-rpc.com/?api-key=19d06ab4-7e29-4c81-8fef-2af6f4d51bbe";
const RPC_URL = CLUSTER === "localnet" ? "http://127.0.0.1:8899" : HELIUS_DEVNET;

// Program IDs from Anchor.toml (devnet)
const SLA_ENFORCER_PROGRAM = new PublicKey("714he4Q3tN95jPAjFZP2tTofqkyzdwTcU9GEMCdNuZBa");
const FEE_COLLECTOR_PROGRAM = new PublicKey("AYpC3BvP95v9d2PxgoY3C51f2LtBtWTwK7aDuoFr25Go");

const LOCK_DECIMALS = 9;
const LOCK_TOTAL_SUPPLY = 1_000_000_000n * BigInt(10 ** LOCK_DECIMALS); // 1B LOCK

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  // Load payer keypair
  const payerPath = path.join(process.env.HOME ?? "~", ".config", "solana", "id.json");
  if (!fs.existsSync(payerPath)) {
    console.error(`Keypair not found at ${payerPath}. Run: solana-keygen new`);
    process.exit(1);
  }
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerPath, "utf-8")))
  );
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const balance = await conn.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);
  if (balance < 0.1 * 1e9 && CLUSTER !== "localnet") {
    console.error("Insufficient balance. Run: solana airdrop 2");
    process.exit(1);
  }

  // Derive PDAs for PermanentDelegate and TransferHook authority
  const [slaEnforcerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sla_enforcer")],
    SLA_ENFORCER_PROGRAM
  );
  const [feeCollectorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_collector")],
    FEE_COLLECTOR_PROGRAM
  );

  console.log(`SLAEnforcer PDA (PermanentDelegate): ${slaEnforcerPda.toBase58()}`);
  console.log(`FeeCollector PDA (TransferHook): ${feeCollectorPda.toBase58()}`);

  // Generate mint keypair (save it for reference)
  const mintKeypair = Keypair.generate();
  const mintAddress = mintKeypair.publicKey;
  console.log(`\nLOCK Mint: ${mintAddress.toBase58()}`);

  // Calculate space for mint with extensions
  const extensions: ExtensionType[] = [
    ExtensionType.PermanentDelegate,
    ExtensionType.TransferHook,
    ExtensionType.InterestBearingConfig,
  ];
  const mintLen = getMintLen(extensions);
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen);

  // Build transaction: create account + initialize extensions + initialize mint
  const tx = new Transaction().add(
    // 1. Create the mint account
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintAddress,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),

    // 2. Initialize PermanentDelegate extension (SLAEnforcer PDA)
    createInitializePermanentDelegateInstruction(
      mintAddress,
      slaEnforcerPda,
      TOKEN_2022_PROGRAM_ID
    ),

    // 3. Initialize TransferHook extension (FeeCollector program)
    createInitializeTransferHookInstruction(
      mintAddress,
      payer.publicKey,        // update authority
      feeCollectorPda,        // transfer hook program id
      TOKEN_2022_PROGRAM_ID
    ),

    // 4. Initialize InterestBearing extension (8% APY = 800 bps)
    createInitializeInterestBearingMintInstruction(
      mintAddress,
      payer.publicKey,        // rate authority
      800,                    // 800 bps = 8% APY
      TOKEN_2022_PROGRAM_ID
    ),

    // 5. Initialize the mint itself
    createInitializeMintInstruction(
      mintAddress,
      LOCK_DECIMALS,
      payer.publicKey,        // mint authority (DAO after TGE)
      null,                   // freeze authority: none
      TOKEN_2022_PROGRAM_ID
    )
  );

  console.log("\nSending transaction...");
  const sig = await sendAndConfirmTransaction(conn, tx, [payer, mintKeypair]);
  console.log(`Tx: https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`);
  console.log(`\nLOCK Mint created: ${mintAddress.toBase58()}`);

  // Save mint address to a config file for use by other scripts
  const output = {
    mint: mintAddress.toBase58(),
    mintAuthority: payer.publicKey.toBase58(),
    permanentDelegate: slaEnforcerPda.toBase58(),
    transferHook: feeCollectorPda.toBase58(),
    decimals: LOCK_DECIMALS,
    totalSupply: LOCK_TOTAL_SUPPLY.toString(),
    cluster: CLUSTER,
    createdAt: new Date().toISOString(),
    txSig: sig,
  };

  const outPath = path.join(__dirname, "..", "lock-mint.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nMint config saved to ${outPath}`);
  console.log("\nNext steps:");
  console.log("  1. anchor build && anchor deploy --provider.cluster devnet");
  console.log("  2. Run scripts/mint-initial-supply.ts to distribute:");
  console.log("     - 34% Workers (GridPoints → LOCK at TGE)");
  console.log("     - 20% Team (4-year vest, 1-year cliff)");
  console.log("     - 20% Investors (2-year vest, 6-month cliff)");
  console.log("     - 16% Ecosystem / Grants");
  console.log("     - 10% Treasury DAO");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
