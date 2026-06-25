import { verifyAndGetStudentWallet } from './privy';
import { registerPartnerOnChain, claimPrizeOnChain, startRedemptionEventListener } from './stellar_pay';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('================================================================');
  console.log('       E4C Stellar Disbursement & Integration Service           ');
  console.log('       PULSO Hackathon 2026 - Web3 Infrastructure Layer        ');
  console.log('================================================================');
  console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Stellar Network: Testnet`);
  console.log(`Soroban RPC: ${process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'}`);
  console.log(`Escrow Contract ID: ${process.env.ESCROW_CONTRACT_ID || 'CD5L45... (Soroban Escrow Contract)'}`);
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Demonstrating Partner Registration
    // -------------------------------------------------------------------------
    console.log('[Bootstrap] Scenario 1: Initializing Cultural Partners...');
    const cinemaPartnerId = 101;
    const cinemaWallet = 'GCINEMA32W...MOCK_PARTNER_WALLET_ADDRESS'; // Mock Stellar wallet for the Cinema
    
    // In a real-world runtime, this calls the Soroban contract:
    // await registerPartnerOnChain(cinemaPartnerId, cinemaWallet);
    console.log(`[Bootstrap] [MOCK] Registered Cinema Partner (ID: ${cinemaPartnerId}) with wallet: ${cinemaWallet}`);
    
    const libraryPartnerId = 102;
    const libraryWallet = 'GLIBRARY987...MOCK_PARTNER_WALLET_ADDRESS'; // Mock Stellar wallet for the Library
    // await registerPartnerOnChain(libraryPartnerId, libraryWallet);
    console.log(`[Bootstrap] [MOCK] Registered Library Partner (ID: ${libraryPartnerId}) with wallet: ${libraryWallet}\n`);

    // -------------------------------------------------------------------------
    // STEP 2: Simulating Student Auth & Claim Flow via Privy
    // -------------------------------------------------------------------------
    console.log('[Bootstrap] Scenario 2: Processing Student Claim...');
    
    // Simulate a JWT Token received from the client app (representing a Google Login via Privy)
    const mockAuthToken = 'mock_jwt_token_google_institutional_login';
    console.log(`[Bootstrap] Received authentication token from student client: ${mockAuthToken.slice(0, 15)}...`);

    // In a live server, we verify the JWT against Privy and extract the user profile and embedded wallet:
    // const student = await verifyAndGetStudentWallet(mockAuthToken);
    
    // For demonstration, we simulate the verified result:
    const mockStudent = {
      userId: 'privy-user-123456789',
      email: 'pablo.gomez@estudiante.edu.ar', // Institutional email domain verified
      stellarWalletAddress: 'GB2Z46...MOCK_STUDENT_WALLET'
    };

    console.log('[Bootstrap] Privy Authentication Successful!');
    console.log(`  - Student User ID: ${mockStudent.userId}`);
    console.log(`  - Institutional Email: ${mockStudent.email} (VALIDATED)`);
    console.log(`  - Embedded Stellar Wallet: ${mockStudent.stellarWalletAddress}`);
    console.log('[Bootstrap] Mapping student to reward tier...\n');

    // -------------------------------------------------------------------------
    // STEP 3: Executing Soroban Claim
    // -------------------------------------------------------------------------
    console.log('[Bootstrap] Scenario 3: Disbursing Incentives on Soroban...');
    const claimAmount = 10_000_000n; // 10 USDC (Stellar token standard 7 decimals)
    
    console.log(`[Bootstrap] Requesting claim of 10.00 USDC for Student at Cinema (Partner ID: ${cinemaPartnerId})`);
    
    // In production, this submits the transaction to Stellar Testnet:
    // const txHash = await claimPrizeOnChain(mockStudent.stellarWalletAddress, cinemaPartnerId, claimAmount);
    // console.log(`[Bootstrap] Claim processed successfully! Transaction Hash: ${txHash}`);
    
    console.log(`[Bootstrap] [MOCK] Claim processed successfully on-chain!`);
    console.log(`  - Payout of 10.00 USDC sent to Partner Wallet: ${cinemaWallet}`);
    console.log(`  - Event 'claim' emitted on Soroban contract CD5L45...\n`);

    // -------------------------------------------------------------------------
    // STEP 4: Start background webhook/redemption listener
    // -------------------------------------------------------------------------
    console.log('[Bootstrap] Starting microservice listening loops...');
    startRedemptionEventListener();

  } catch (error: any) {
    console.error('[Bootstrap] Initialization failed:', error.message);
  }
}

bootstrap();
