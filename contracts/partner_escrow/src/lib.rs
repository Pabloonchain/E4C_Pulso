#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Partner(u32),
}

#[contract]
pub struct PartnerEscrowContract;

#[contractimpl]
impl PartnerEscrowContract {
    /// Initializes the partner escrow contract with an admin and token (USDC) contract address.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Registers or updates the public wallet address for a partner.
    /// Only the administrator can call this.
    pub fn register_partner(env: Env, partner_id: u32, partner_wallet: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Partner(partner_id), &partner_wallet);

        // Publish event for tracking partner registration
        env.events().publish(
            (symbol_short!("reg_part"), partner_id),
            partner_wallet,
        );
    }

    /// Claims a prize by sending USDC from the escrow contract to the partner's wallet.
    /// Requires administrator (backend) authorization to prevent unauthorized claims.
    pub fn claim_prize(env: Env, student_wallet: Address, partner_id: u32, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Retrieve partner wallet
        let partner_wallet: Address = env
            .storage()
            .instance()
            .get(&DataKey::Partner(partner_id))
            .expect("partner not registered");

        // Retrieve token contract address
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).expect("token not configured");

        // Initialize Soroban token client
        let token_client = soroban_sdk::token::Client::new(&env, &token_addr);

        // Transfer the incentives (USDC) from the contract's own address to the partner's wallet
        let contract_address = env.current_contract_address();
        token_client.transfer(&contract_address, &partner_wallet, &amount);

        // Publish event for student prize claim
        env.events().publish(
            (symbol_short!("claim"), student_wallet, partner_id),
            (partner_wallet, amount),
        );
    }

    /// Returns the administrator address.
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    /// Returns the token contract address.
    pub fn get_token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).expect("not initialized")
    }

    /// Returns the wallet address of a registered partner, if any.
    pub fn get_partner(env: Env, partner_id: u32) -> Option<Address> {
        env.storage().instance().get(&DataKey::Partner(partner_id))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{Env, Address, testutils::Address as _};
    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;

    #[test]
    fn test_escrow_workflow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let student = Address::generate(&env);
        let partner_wallet = Address::generate(&env);
        let partner_id = 101;
        let amount = 10_000_000i128; // e.g. 10 USDC

        // Deploy Token (USDC mock)
        let token_admin_addr = Address::generate(&env);
        let token_addr = env.register_stellar_asset_contract(token_admin_addr.clone());
        let token_client = TokenClient::new(&env, &token_addr);
        let token_admin_client = TokenAdminClient::new(&env, &token_addr);

        // Deploy Escrow Contract
        let contract_id = env.register_contract(None, PartnerEscrowContract);
        let client = PartnerEscrowContractClient::new(&env, &contract_id);

        // Initialize escrow
        client.initialize(&admin, &token_addr);

        // Verify initial setup
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_token(), token_addr);

        // Register partner
        client.register_partner(&partner_id, &partner_wallet);
        assert_eq!(client.get_partner(&partner_id), Some(partner_wallet.clone()));

        // Mint some tokens to the escrow contract
        token_admin_client.mint(&contract_id, &amount);
        assert_eq!(token_client.balance(&contract_id), amount);

        // Claim prize
        client.claim_prize(&student, &partner_id, &amount);

        // Check balances
        assert_eq!(token_client.balance(&contract_id), 0);
        assert_eq!(token_client.balance(&partner_wallet), amount);
    }
}
