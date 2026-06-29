import {
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export async function sendLockStake(params: {
  connection: Connection;
  publicKey: PublicKey;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { skipPreflight?: boolean },
  ) => Promise<string>;
  lockMint: string;
  stakerVaultAta: string;
  stakerVaultAuthority: string;
  amountLock: number;
  decimals?: number;
}): Promise<string> {
  const mint = new PublicKey(params.lockMint);
  const vaultAta = new PublicKey(params.stakerVaultAta);
  const vaultAuthority = new PublicKey(params.stakerVaultAuthority);
  const decimals = params.decimals ?? 9;
  const baseUnits = BigInt(Math.floor(params.amountLock * 10 ** decimals));

  const ownerAta = getAssociatedTokenAddressSync(
    mint,
    params.publicKey,
    !PublicKey.isOnCurve(params.publicKey.toBuffer()),
    TOKEN_2022_PROGRAM_ID,
  );

  const tx = new Transaction();

  const ownerAtaInfo = await params.connection.getAccountInfo(ownerAta);
  if (!ownerAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        params.publicKey,
        ownerAta,
        params.publicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  const vaultInfo = await params.connection.getAccountInfo(vaultAta);
  if (!vaultInfo) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstructionWithDerivation(
        params.publicKey,
        vaultAuthority,
        mint,
        true,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      ownerAta,
      mint,
      vaultAta,
      params.publicKey,
      baseUnits,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  return params.sendTransaction(tx, params.connection);
}

export async function sendClaimUnstakeTransaction(params: {
  connection: Connection;
  sendTransaction: (
    transaction: VersionedTransaction,
    connection: Connection,
    options?: { skipPreflight?: boolean },
  ) => Promise<string>;
  transactionBase64: string;
}): Promise<string> {
  const vtx = VersionedTransaction.deserialize(Buffer.from(params.transactionBase64, "base64"));
  return params.sendTransaction(vtx, params.connection);
}
