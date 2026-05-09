#[cfg(test)]
mod tests {
    use crate::ID as PROGRAM_ID;
    use litesvm::LiteSVM;
    use solana_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
        rent::Rent,
        signature::{Keypair, Signer},
        system_program,
        transaction::Transaction,
    };

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

    const IX_DEPOSIT: [u8; 8] = [242, 35, 198, 137, 82, 225, 242, 182];
    const IX_WITHDRAW: [u8; 8] = [183, 18, 70, 156, 148, 109, 161, 34];
    const IX_WITHDRAW_PARTIAL: [u8; 8] = [142, 181, 230, 69, 132, 105, 19, 229];
    const IX_SEND_TO: [u8; 8] = [62, 157, 126, 77, 114, 26, 84, 160];

    fn get_vault_pda(signer: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", signer.as_ref()], &PROGRAM_ID)
    }

    fn rent_exempt_minimum() -> u64 {
        Rent::default().minimum_balance(0)
    }

    fn ix_deposit(signer: &Pubkey, vault: &Pubkey, amount: u64) -> Instruction {
        let mut data = IX_DEPOSIT.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn ix_withdraw(signer: &Pubkey, vault: &Pubkey) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: IX_WITHDRAW.to_vec(),
        }
    }

    fn ix_withdraw_partial(signer: &Pubkey, vault: &Pubkey, amount: u64) -> Instruction {
        let mut data = IX_WITHDRAW_PARTIAL.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn ix_send_to(signer: &Pubkey, vault: &Pubkey, recipient: &Pubkey, amount: u64) -> Instruction {
        let mut data = IX_SEND_TO.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new(*recipient, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn send_ix(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) {
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[payer],
            blockhash,
        );
        svm.send_transaction(tx).unwrap();
    }

    #[test]
    fn test_deposit_and_withdraw_full() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _) = get_vault_pda(&user.pubkey());
        let rent = rent_exempt_minimum();
        let deposit_amount = rent + LAMPORTS_PER_SOL;

        send_ix(&mut svm, &user, ix_deposit(&user.pubkey(), &vault_pda, deposit_amount));

        let vault_after = svm.get_account(&vault_pda).unwrap();
        assert_eq!(vault_after.lamports, deposit_amount);

        send_ix(
            &mut svm,
            &user,
            ix_withdraw(&user.pubkey(), &vault_pda),
        );

        let vault_after_full = svm.get_account(&vault_pda);
        assert!(
            vault_after_full.is_none() || vault_after_full.unwrap().lamports == 0,
            "vault drained"
        );
    }

    #[test]
    fn test_two_deposits_accumulate() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _) = get_vault_pda(&user.pubkey());
        let rent = rent_exempt_minimum();

        send_ix(
            &mut svm,
            &user,
            ix_deposit(&user.pubkey(), &vault_pda, rent + LAMPORTS_PER_SOL),
        );
        send_ix(
            &mut svm,
            &user,
            ix_deposit(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL),
        );

        let bal = svm.get_account(&vault_pda).unwrap().lamports;
        assert_eq!(bal, rent + 2 * LAMPORTS_PER_SOL);
    }

    #[test]
    fn test_partial_withdraw_then_full() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _) = get_vault_pda(&user.pubkey());
        let rent = rent_exempt_minimum();

        send_ix(
            &mut svm,
            &user,
            ix_deposit(&user.pubkey(), &vault_pda, rent + 3 * LAMPORTS_PER_SOL),
        );

        let partial = LAMPORTS_PER_SOL;
        send_ix(
            &mut svm,
            &user,
            ix_withdraw_partial(&user.pubkey(), &vault_pda, partial),
        );

        let left = svm.get_account(&vault_pda).unwrap().lamports;
        assert_eq!(left, rent + 2 * LAMPORTS_PER_SOL);

        send_ix(
            &mut svm,
            &user,
            ix_withdraw(&user.pubkey(), &vault_pda),
        );

        assert!(
            svm.get_account(&vault_pda).is_none()
                || svm.get_account(&vault_pda).unwrap().lamports == 0,
            "vault empty after full withdraw"
        );
    }

    #[test]
    fn test_send_to_recipient() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);

        let sender = Keypair::new();
        let recipient_kp = Keypair::new();
        let recipient = recipient_kp.pubkey();

        svm.airdrop(&sender.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _) = get_vault_pda(&sender.pubkey());
        let rent = rent_exempt_minimum();

        send_ix(
            &mut svm,
            &sender,
            ix_deposit(
                &sender.pubkey(),
                &vault_pda,
                rent + 2 * LAMPORTS_PER_SOL,
            ),
        );

        let before_recipient = svm.get_account(&recipient).map(|a| a.lamports).unwrap_or(0);
        let send_amt = LAMPORTS_PER_SOL;

        send_ix(
            &mut svm,
            &sender,
            ix_send_to(&sender.pubkey(), &vault_pda, &recipient, send_amt),
        );

        let after_recipient = svm.get_account(&recipient).unwrap().lamports;
        assert_eq!(after_recipient - before_recipient, send_amt);

        let vault_left = svm.get_account(&vault_pda).unwrap().lamports;
        assert!(vault_left >= rent);
        assert_eq!(vault_left, rent + LAMPORTS_PER_SOL);
    }

    #[test]
    fn test_withdraw_fails_if_vault_empty() {
        let mut svm = LiteSVM::new();

        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _) = get_vault_pda(&user.pubkey());

        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix_withdraw(&user.pubkey(), &vault_pda)],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        assert!(svm.send_transaction(tx).is_err());
    }
}
