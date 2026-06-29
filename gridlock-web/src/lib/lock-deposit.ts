import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export async function sendLockDeposit(params: {
  connection: Connection;
  publicKey: PublicKey;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { skipPreflight?: boolean },
  ) => Promise<string>;
  lockMint: string;
  depositVault: string;
  amountLock: number;
  decimals?: number;
}): Promise<string> {
  const mint = new PublicKey(params.lockMint);
  const vault = new PublicKey(params.depositVault);
  const decimals = params.decimals ?? 9;
  const baseUnits = BigInt(Math.floor(params.amountLock * 10 ** decimals));

  const ownerAta = getAssociatedTokenAddressSync(
    mint,
    params.publicKey,
    false,
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

  tx.add(
    createTransferCheckedInstruction(
      ownerAta,
      mint,
      vault,
      params.publicKey,
      baseUnits,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  return params.sendTransaction(tx, params.connection);
}
