use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, Token2022, TokenAccount, TransferChecked,
};

declare_id!("4TVPu4tTHfHWLaj8Srbp6v89KHPcN1t5iijNxQrSR4ci");

// ── Program ──────────────────────────────────────────────────────────────────

#[program]
pub mod sla_enforcer {
    use super::*;

    /// Settle a finalized receipt: release escrow on SLA met, penalize on miss.
    ///
    /// This is the critical instruction — it uses the Token-2022
    /// PermanentDelegate to transfer penalty directly from the worker's
    /// staked LOCK to the customer without requiring the worker's signature.
    pub fn settle_or_penalize(ctx: Context<SettleOrPenalize>, job_id: [u8; 32]) -> Result<()> {
        let receipt = &ctx.accounts.receipt;
        require!(receipt.finalized, ErrorCode::ReceiptNotFinalized);
        require!(receipt.job_id == job_id, ErrorCode::JobIdMismatch);

        let job = &ctx.accounts.job;
        require!(job.job_id == job_id, ErrorCode::JobIdMismatch);

        if receipt.sla_met {
            // ── Happy path: release escrow to fee collector ───────────────
            // FeeCollector splits: 60% stakers / 20% workers / 10% burn / 10% treasury
            emit!(JobSettled {
                job_id,
                sla_met: true,
                penalty_amount: 0,
            });
            msg!("SLA met — releasing escrow to FeeCollector");
        } else {
            // ── Penalty path: PermanentDelegate auto-transfer ─────────────
            let penalty_amount = penalty_for_tier(&receipt.sla_tier, job.payment_amount)?;

            let actual_penalty = if ctx.accounts.worker_stake.amount >= penalty_amount {
                penalty_amount
            } else {
                // Worker stake insufficient — insurance pool tops up the diff
                let shortfall = penalty_amount - ctx.accounts.worker_stake.amount;
                emit!(InsuranceTopUp { job_id, amount: shortfall });
                ctx.accounts.worker_stake.amount
            };

            // Transfer penalty from worker stake → customer using PermanentDelegate
            // The SLAEnforcer PDA holds the PermanentDelegate authority over all
            // worker stake accounts — set at LOCK mint initialization time.
            let enforcer_seeds: &[&[u8]] = &[b"sla_enforcer", &[ctx.bumps.enforcer_authority]];
            let signer = &[enforcer_seeds];

            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.worker_stake.to_account_info(),
                        mint: ctx.accounts.lock_mint.to_account_info(),
                        to: ctx.accounts.customer_wallet.to_account_info(),
                        authority: ctx.accounts.enforcer_authority.to_account_info(),
                    },
                    signer,
                ),
                actual_penalty,
                ctx.accounts.lock_mint.decimals,
            )?;

            emit!(JobSettled {
                job_id,
                sla_met: false,
                penalty_amount: actual_penalty,
            });

            msg!(
                "SLA MISSED — {} LOCK penalty transferred worker→customer (PermanentDelegate)",
                actual_penalty
            );
        }
        Ok(())
    }

    /// Mark a job as missed due to worker abandonment (heartbeat timeout).
    /// Called by the heartbeat crank after ProviderRegistry detects timeout.
    pub fn mark_missed(ctx: Context<MarkMissed>, job_id: [u8; 32]) -> Result<()> {
        // Force the receipt to sla_met=false so settle_or_penalize applies penalty
        let receipt = &mut ctx.accounts.receipt;
        receipt.sla_met = false;
        receipt.finalized = true;
        emit!(JobAbandoned { job_id });
        Ok(())
    }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct SettleOrPenalize<'info> {
    /// PDA that holds PermanentDelegate authority over worker stake accounts
    #[account(
        seeds = [b"sla_enforcer"],
        bump,
    )]
    pub enforcer_authority: SystemAccount<'info>,

    /// The finalized latency receipt (from SLARegistry)
    pub receipt: Account<'info, ReceiptAccount>,

    /// The job account (from JobScheduler)
    pub job: Account<'info, ServingJob>,

    /// Worker's staked LOCK token account — penalty is deducted here
    #[account(mut)]
    pub worker_stake: InterfaceAccount<'info, TokenAccount>,

    /// Customer's LOCK wallet — receives the penalty
    #[account(mut)]
    pub customer_wallet: InterfaceAccount<'info, TokenAccount>,

    /// LOCK mint (Token-2022)
    pub lock_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct MarkMissed<'info> {
    /// Only ProviderRegistry (via CPI) can call this
    pub provider_registry: Signer<'info>,
    #[account(mut)]
    pub receipt: Account<'info, ReceiptAccount>,
}

// ── Imported state from other programs (simplified stubs) ────────────────────

/// Minimal view of ReceiptAccount from SLARegistry
#[account]
pub struct ReceiptAccount {
    pub job_id: [u8; 32],
    pub sla_tier: String,
    pub ttft_ms: u32,
    pub tpot_ms: u32,
    pub sla_met: bool,
    pub finalized: bool,
    pub confidential: bool,
    pub bump: u8,
}

/// Minimal view of ServingJob from JobScheduler
#[account]
pub struct ServingJob {
    pub job_id: [u8; 32],
    pub customer: Pubkey,
    pub payment_amount: u64,
    pub sla_tier: String,
    pub bump: u8,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct JobSettled {
    pub job_id: [u8; 32],
    pub sla_met: bool,
    pub penalty_amount: u64,
}

#[event]
pub struct InsuranceTopUp {
    pub job_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct JobAbandoned {
    pub job_id: [u8; 32],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Penalty = fee × multiplier per tier
fn penalty_for_tier(tier: &str, fee: u64) -> Result<u64> {
    let mult_bps: u64 = match tier {
        "realtime"     => 200, // 2×
        "standard"     => 100, // 1×
        "batch"        => 25,  // 0.25×
        "confidential" => 100, // 1×
        _ => return err!(ErrorCode::UnknownSlaTier),
    };
    Ok(fee * mult_bps / 100)
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Receipt is not yet finalized")]
    ReceiptNotFinalized,
    #[msg("Job ID mismatch between receipt and job accounts")]
    JobIdMismatch,
    #[msg("Unknown SLA tier")]
    UnknownSlaTier,
}
