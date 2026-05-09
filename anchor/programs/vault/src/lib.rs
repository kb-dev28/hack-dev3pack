use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[cfg(test)]
mod tests;

declare_id!("AhG1mX9GuvsiZSvoHE4yjro92xbP5Rswx87NnusoQPrf");

#[program]
pub mod vault {
    use super::*;

    /// Deposit native SOL into the vault PDA. Multiple deposits accumulate.
    pub fn deposit(ctx: Context<VaultAction>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, VaultError::InvalidAmount);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        enforce_vault_rent_exempt(&ctx.accounts.vault)?;
        Ok(())
    }

    /// Withdraw the full vault balance to the vault owner (drains lamports including rent carve-out semantics of a full CPI transfer).
    pub fn withdraw(ctx: Context<VaultAction>) -> Result<()> {
        let amount = ctx.accounts.vault.lamports();
        require_gt!(amount, 0u64, VaultError::InvalidAmount);

        vault_transfer_signed(
            &ctx.accounts.system_program,
            &ctx.accounts.vault,
            ctx.accounts.signer.to_account_info(),
            &ctx.accounts.signer.key(),
            ctx.bumps.vault,
            amount,
        )
    }

    /// Withdraw up to spendable lamports (`balance - rent_exempt_minimum`) back to the owner.
    pub fn withdraw_partial(ctx: Context<VaultAction>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, VaultError::InvalidAmount);

        let rent = Rent::get()?.minimum_balance(0);
        let spendable = spendable_lamports(ctx.accounts.vault.lamports(), rent)?;

        require_gte!(
            spendable,
            amount,
            VaultError::InsufficientVaultBalance
        );

        vault_transfer_signed(
            &ctx.accounts.system_program,
            &ctx.accounts.vault,
            ctx.accounts.signer.to_account_info(),
            &ctx.accounts.signer.key(),
            ctx.bumps.vault,
            amount,
        )?;

        enforce_vault_rent_exempt(&ctx.accounts.vault)?;
        Ok(())
    }

    /// Send lamports from the vault to any recipient while keeping rent on the vault.
    pub fn send_to(ctx: Context<VaultSendTo>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, VaultError::InvalidAmount);
        require_keys_neq!(
            ctx.accounts.recipient.key(),
            ctx.accounts.vault.key(),
            VaultError::InvalidRecipient
        );

        let rent = Rent::get()?.minimum_balance(0);
        let spendable = spendable_lamports(ctx.accounts.vault.lamports(), rent)?;

        require_gte!(
            spendable,
            amount,
            VaultError::InsufficientVaultBalance
        );

        vault_transfer_signed(
            &ctx.accounts.system_program,
            &ctx.accounts.vault,
            ctx.accounts.recipient.to_account_info(),
            &ctx.accounts.signer.key(),
            ctx.bumps.vault,
            amount,
        )?;

        enforce_vault_rent_exempt(&ctx.accounts.vault)?;
        Ok(())
    }
}

fn spendable_lamports(balance: u64, rent_minimum: u64) -> Result<u64> {
    balance
        .checked_sub(rent_minimum)
        .ok_or_else(|| error!(VaultError::VaultBelowRentMinimum))
}

fn enforce_vault_rent_exempt(vault: &SystemAccount<'_>) -> Result<()> {
    let rent = Rent::get()?.minimum_balance(0);
    require_gte!(
        vault.lamports(),
        rent,
        VaultError::VaultBelowRentMinimum
    );
    Ok(())
}

fn vault_transfer_signed<'info>(
    system_program: &Program<'info, System>,
    from_vault: &SystemAccount<'info>,
    to: AccountInfo<'info>,
    owner_pubkey: &Pubkey,
    bump: u8,
    amount: u64,
) -> Result<()> {
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault", owner_pubkey.as_ref(), &[bump]]];

    transfer(
        CpiContext::new_with_signer(
            system_program.to_account_info(),
            Transfer {
                from: from_vault.to_account_info(),
                to,
            },
            signer_seeds,
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct VaultAction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", signer.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultSendTo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", signer.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    /// CHECK: Native SOL recipient.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum VaultError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Vault lamports fell below rent-exempt minimum")]
    VaultBelowRentMinimum,
    #[msg("Insufficient spendable vault balance")]
    InsufficientVaultBalance,
    #[msg("Invalid recipient")]
    InvalidRecipient,
}
