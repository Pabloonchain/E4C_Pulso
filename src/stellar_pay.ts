import {
  rpc,
  Keypair,
  TransactionBuilder,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
  BASE_FEE
} from '@stellar/stellar-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Configure connection endpoints for Stellar Testnet
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const ESCROW_CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || 'CD5L453U2XWNG2K2ND5L4W7LWD6Z5N2WCD5L4W7LWD6Z5N2WCD5L4W7L'; // Placeholder
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'SBCXP...'; // Admin secret key

const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

/**
 * Gets the admin keypair from the environment variable.
 */
function getAdminKeypair(): Keypair {
  if (!process.env.ADMIN_SECRET_KEY) {
    console.warn('WARNING: ADMIN_SECRET_KEY is not set in environment. Generating a random keypair for simulation.');
    return Keypair.random();
  }
  return Keypair.fromSecret(process.env.ADMIN_SECRET_KEY);
}

/**
 * Registers a cultural partner's public wallet address in the Soroban contract.
 * 
 * @param partnerId Unique ID of the partner (e.g. 101 for Cinema, 102 for Library)
 * @param partnerWallet Stellar public address of the partner
 */
export async function registerPartnerOnChain(partnerId: number, partnerWallet: string): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Registering partner ${partnerId} with wallet ${partnerWallet} on-chain...`);

  // Initialize contract representation
  const contract = new Contract(ESCROW_CONTRACT_ID);

  // Build the operation invoking the register_partner function
  const operation = contract.call(
    'register_partner',
    nativeToScVal(partnerId, { type: 'u32' }),
    Address.fromString(partnerWallet).toScVal()
  );

  return await sendSorobanTransaction(adminKeypair, operation);
}

/**
 * Triggers the settlement for a student's prize claim on the Soroban contract.
 * 
 * @param studentWallet Student's embedded Stellar wallet address
 * @param partnerId ID of the partner where the prize is being claimed
 * @param amount Amount of USDC (in stroke/stroops/smallest units, e.g. 10 USDC = 10_000_000)
 */
export async function claimPrizeOnChain(
  studentWallet: string,
  partnerId: number,
  amount: bigint
): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Executing claim_prize for student ${studentWallet} at partner ${partnerId} (Amount: ${amount})`);

  // Initialize contract representation
  const contract = new Contract(ESCROW_CONTRACT_ID);

  // Build the operation invoking the claim_prize function
  const operation = contract.call(
    'claim_prize',
    Address.fromString(studentWallet).toScVal(),
    nativeToScVal(partnerId, { type: 'u32' }),
    nativeToScVal(amount, { type: 'i128' })
  );

  return await sendSorobanTransaction(adminKeypair, operation);
}

/**
 * Helper function to simulate, sign, assemble and submit a Soroban transaction.
 */
async function sendSorobanTransaction(signer: Keypair, operation: any): Promise<string> {
  try {
    // Fetch source account sequence number
    const sourceAccount = await rpcServer.getAccount(signer.publicKey());

    // Build the initial transaction
    let tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // Simulate the transaction (required for Soroban to fetch footprint and fee metadata)
    console.log('[StellarPay] Simulating transaction...');
    const simulation = await rpcServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(simulation)) {
      console.log('[StellarPay] Simulation success. Assembling transaction...');
      // rpc.assembleTransaction returns a TransactionBuilder, which needs to be built into a Transaction
      tx = rpc.assembleTransaction(tx, simulation).build();
    } else {
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.error)}`);
    }

    // Sign transaction with our admin keypair
    tx.sign(signer);

    // Submit transaction to Soroban RPC
    console.log('[StellarPay] Submitting transaction to Testnet RPC...');
    const sendTxResponse = await rpcServer.sendTransaction(tx);

    if (sendTxResponse.status === 'ERROR') {
      throw new Error(`Send transaction failed: ${JSON.stringify(sendTxResponse.errorResult)}`);
    }

    const txHash = sendTxResponse.hash;
    console.log(`[StellarPay] Transaction submitted successfully. Hash: ${txHash}`);

    // Poll for transaction result
    console.log('[StellarPay] Waiting for transaction resolution...');
    let getTxResponse = await rpcServer.getTransaction(txHash);
    let attempts = 0;
    
    while (getTxResponse.status === 'NOT_FOUND' && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getTxResponse = await rpcServer.getTransaction(txHash);
      attempts++;
    }

    if (getTxResponse.status === 'SUCCESS') {
      console.log(`[StellarPay] Transaction successfully included in ledger! Result:`, getTxResponse.resultXdr);
      return txHash;
    } else {
      throw new Error(`Transaction failed with status: ${getTxResponse.status}. Error: ${JSON.stringify(getTxResponse)}`);
    }
  } catch (error: any) {
    console.error('[StellarPay] Error sending transaction:', error);
    throw error;
  }
}

/**
 * Simple subscriber simulator demonstrating how the E4C backend listens 
 * to offline redemption events and triggers the on-chain settlement.
 */
export function startRedemptionEventListener() {
  console.log('[StellarPay] Listening for E4C backend redemption events...');
  
  // Simulated event emitter/webhook handler
  // In production, this would subscribe to a message queue or webhook from the main app
  setInterval(async () => {
    // Mocking an occasional incoming redemption event
    const shouldSimulate = Math.random() > 0.85;
    if (shouldSimulate) {
      const mockRedemption = {
        studentWallet: 'GB2Z46...MOCK_STUDENT_WALLET',
        partnerId: Math.floor(Math.random() * 5) + 100, // ID between 100 and 105
        amount: BigInt(5000000) // 5 USDC (6 decimals)
      };

      console.log(`[StellarPay] Received redemption event: Student claimed prize at Partner ID ${mockRedemption.partnerId}`);
      try {
        // Skip actual call to avoid network errors on invalid keys/contract address, 
        // but log the mock execution
        console.log(`[StellarPay] [MOCK] Triggering payout of ${mockRedemption.amount} to Partner ${mockRedemption.partnerId}`);
      } catch (err: any) {
        console.error('[StellarPay] Failed to process mock redemption event:', err.message);
      }
    }
  }, 10000);
}

/**
 * Fetches the student passport details from the Soroban contract.
 * 
 * @param studentWallet Student's embedded Stellar wallet address
 * @returns The passport details { reputation, challenges } or null if not found/error
 */
export async function getStudentPassportOnChain(
  studentWallet: string
): Promise<{ reputation: number; challenges: number[] } | null> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Fetching student passport for ${studentWallet} on-chain...`);

  try {
    const contract = new Contract(ESCROW_CONTRACT_ID);
    const operation = contract.call(
      'get_student_passport',
      Address.fromString(studentWallet).toScVal()
    );

    const sourceAccount = await rpcServer.getAccount(adminKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simulation = await rpcServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
      const scVal = simulation.result.retval;
      if (!scVal || scVal.switch().name === 'scvVoid' || scVal.switch().value === 0) {
        return null;
      }
      const native = scValToNative(scVal);
      if (!native) return null;
      return {
        reputation: Number(native.reputation),
        challenges: (native.challenges || []).map((c: any) => Number(c))
      };
    }
    return null;
  } catch (error: any) {
    console.error('[StellarPay] Error fetching student passport:', error.message);
    return null;
  }
}

/**
 * Registers a completed challenge for a student on-chain.
 * 
 * @param studentWallet Student's embedded Stellar wallet address
 * @param challengeId Unique ID of the challenge completed
 * @param reputationBoost The amount of reputation to add to the student
 */
export async function addStudentChallengeOnChain(
  studentWallet: string,
  challengeId: number,
  reputationBoost: number
): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Registering challenge ID ${challengeId} (Boost: ${reputationBoost}) for student ${studentWallet}`);

  const contract = new Contract(ESCROW_CONTRACT_ID);
  const operation = contract.call(
    'add_student_challenge',
    Address.fromString(studentWallet).toScVal(),
    nativeToScVal(challengeId, { type: 'u32' }),
    nativeToScVal(reputationBoost, { type: 'u32' })
  );

  return await sendSorobanTransaction(adminKeypair, operation);
}

/**
 * Updates a student's reputation directly on-chain.
 * 
 * @param studentWallet Student's embedded Stellar wallet address
 * @param reputation New reputation score to set
 */
export async function updateStudentReputationOnChain(
  studentWallet: string,
  reputation: number
): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Directly updating reputation to ${reputation} for student ${studentWallet}`);

  const contract = new Contract(ESCROW_CONTRACT_ID);
  const operation = contract.call(
    'update_student_reputation',
    Address.fromString(studentWallet).toScVal(),
    nativeToScVal(reputation, { type: 'u32' })
  );

  return await sendSorobanTransaction(adminKeypair, operation);
}
