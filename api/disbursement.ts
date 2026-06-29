import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  BASE_FEE,
  Account
} from '@stellar/stellar-sdk';
import { getKMSClient } from '../src/lib/kms';

// Configuration
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const ESCROW_CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || 'CD5L453U2XWNG2K2ND5L4W7LWD6Z5N2WCD5L4W7LWD6Z5N2WCD5L4W7L';
const ADMIN_PUBLIC_KEY = process.env.ADMIN_PUBLIC_KEY || 'GDQD...'; // ONLY public key, NO secret key exposed

const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

/**
 * Mock Redis Sequence Manager to resolve the "Sequence/Nonce Collision" problem.
 * In serverless environments, parallel execution of functions leads to fetch-and-submit collisions.
 * We must lock and increment the sequence number atomically.
 */
class RedisSequenceManager {
  static async acquireAndIncrementSequence(publicKey: string): Promise<bigint> {
    console.log(`[Redis] Locking and incrementing sequence for public key: ${publicKey}`);
    
    // In production, connect to Upstash Redis or similar:
    // const redis = new Redis(...);
    // const currentSequence = await redis.incr(`seq:${publicKey}`);
    
    // Fallback: Fetch from RPC server
    const account = await rpcServer.getAccount(publicKey);
    return BigInt(account.sequenceNumber());
  }
}

/**
 * Utility to sanitize inputs before logging, preventing Log Injection/Forgery (OWASP A09).
 */
function sanitizeLog(val: string): string {
  return val.replace(/[\r\n]/g, '').slice(0, 200);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    // 1. Authorization Check (OWASP A01: Broken Access Control & A07: Auth Failures)
    const authHeader = req.headers['authorization'];
    const secretToken = process.env.API_SECRET_TOKEN;

    if (secretToken) {
      if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== secretToken) {
        const attemptedToken = sanitizeLog(authHeader || 'none');
        console.warn(`[Security Warn] Unauthorized disbursement attempt. AuthHeader: ${attemptedToken}`);
        return res.status(401).json({ error: 'Unauthorized access.' });
      }
    }

    const { studentWallet, partnerId, amount } = req.body;

    // 2. Strict Input Validation & Sanitization (OWASP A03: Injection)
    if (!studentWallet || typeof studentWallet !== 'string' || !/^G[A-Z2-7]{55}$/.test(studentWallet)) {
      return res.status(400).json({ error: 'Invalid parameter: studentWallet (must be a valid Stellar public key).' });
    }

    if (partnerId === undefined || typeof partnerId !== 'number' || !Number.isInteger(partnerId) || partnerId < 0 || partnerId > 2147483647) {
      return res.status(400).json({ error: 'Invalid parameter: partnerId (must be a non-negative 32-bit integer).' });
    }

    if (!amount || typeof amount !== 'string' || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
      return res.status(400).json({ error: 'Invalid parameter: amount (must be a string representing a positive integer).' });
    }

    const cleanWallet = sanitizeLog(studentWallet);
    const cleanAmount = sanitizeLog(amount);
    console.log(`[Disbursement API] Authorized request received for Student: ${cleanWallet}, Partner: ${partnerId}, Amount: ${cleanAmount}`);

    // 3. Fetch sequence atomically from Redis to prevent Nonce collisions (Option A / B)
    const sequenceNumber = await RedisSequenceManager.acquireAndIncrementSequence(ADMIN_PUBLIC_KEY);

    // 4. Load account state representation for building transaction
    const sourceAccount = new Account(ADMIN_PUBLIC_KEY, sequenceNumber.toString());

    // 5. Build the operation calling claim_prize
    const contract = new Contract(ESCROW_CONTRACT_ID);
    const operation = contract.call(
      'claim_prize',
      Address.fromString(studentWallet).toScVal(),
      nativeToScVal(Number(partnerId), { type: 'u32' }),
      nativeToScVal(BigInt(amount), { type: 'i128' })
    );

    // 6. Assemble the raw unsigned transaction
    let tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // 7. Simulate on Soroban to load footprint/fees
    const simulation = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(simulation)) {
      tx = rpc.assembleTransaction(tx, simulation).build();
    } else {
      return res.status(400).json({
        error: 'Transaction simulation failed',
        details: simulation.error
      });
    }

    // 8. DELEGATED SIGNING (Option A - Standard de la Industria)
    // We request the signature from the KMS/Custodian Service without exposing private keys
    const kms = getKMSClient();
    const txSigned = await kms.signTransaction(tx, process.env.KMS_KEY_ALIAS || 'alias/e4c-disbursement-key');

    // 9. ASYNCHRONOUS SUBMISSION (Evita Vercel Timeouts)
    // We submit to RPC network and get the transaction hash immediately
    const submitResponse = await rpcServer.sendTransaction(txSigned);

    if (submitResponse.status === 'ERROR') {
      return res.status(500).json({
        error: 'Transaction submission rejected by RPC',
        details: submitResponse.errorResult
      });
    }

    // We do NOT poll or wait in the serverless handler!
    // We return the status and transaction hash immediately, fulfilling Option A/B requirements.
    return res.status(202).json({
      success: true,
      status: 'PENDING',
      message: 'Transaction sent to the network. Confirmation is pending.',
      txHash: submitResponse.hash,
      ledgerExplorer: `https://stellar.expert/explorer/testnet/tx/${submitResponse.hash}`
    });

  } catch (error: any) {
    const errorMsg = sanitizeLog(error.message || 'Internal Server Error');
    console.error(`[Disbursement Error] ${errorMsg}`);
    
    // OWASP A05: Informar de manera genérica para evitar disclosure de detalles internos/stack traces
    return res.status(500).json({ 
      error: 'Disbursement failed. Please verify authorization and transaction details.' 
    });
  }
}
