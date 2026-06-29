import { NextRequest, NextResponse } from 'next/server';
import {
  Contract,
  TransactionBuilder,
  Networks,
  rpc,
  Address,
  nativeToScVal
} from '@stellar/stellar-sdk';
import { getKMSClient } from '@/lib/kms';

const SorobanRpcServer = rpc.Server;
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const server = new SorobanRpcServer(RPC_URL);
const contractId = process.env.ESCROW_CONTRACT_ID || 'CD5L453U2XWNG2K2ND5L4W7LWD6Z5N2WCD5L4W7LWD6Z5N2WCD5L4W7L';

/**
 * Utility to sanitize inputs before logging, preventing Log Injection/Forgery (OWASP A09).
 */
function sanitizeLog(val: string): string {
  return val.replace(/[\r\n]/g, '').slice(0, 200);
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authorization Check (OWASP A01: Broken Access Control & A07: Auth Failures)
    const authHeader = req.headers.get('authorization');
    const secretToken = process.env.API_SECRET_TOKEN;

    if (secretToken) {
      if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== secretToken) {
        const attemptedToken = sanitizeLog(authHeader || 'none');
        console.warn(`[Security Warn] Unauthorized disbursement attempt. AuthHeader: ${attemptedToken}`);
        return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
      }
    }

    // Parse payload
    const body = await req.json();
    const { studentWallet, partnerId, amount } = body;

    // 2. Strict Input Validation & Sanitization (OWASP A03: Injection)
    if (!studentWallet || typeof studentWallet !== 'string' || !/^G[A-Z2-7]{55}$/.test(studentWallet)) {
      return NextResponse.json({ error: 'Invalid parameter: studentWallet (must be a valid Stellar public key).' }, { status: 400 });
    }

    if (partnerId === undefined || typeof partnerId !== 'number' || !Number.isInteger(partnerId) || partnerId < 0 || partnerId > 2147483647) {
      return NextResponse.json({ error: 'Invalid parameter: partnerId (must be a non-negative 32-bit integer).' }, { status: 400 });
    }

    if (!amount || typeof amount !== 'string' || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
      return NextResponse.json({ error: 'Invalid parameter: amount (must be a string representing a positive integer).' }, { status: 400 });
    }

    const cleanWallet = sanitizeLog(studentWallet);
    const cleanAmount = sanitizeLog(amount);
    console.log(`[Disbursement API] Authorized request received for Student: ${cleanWallet}, Partner: ${partnerId}, Amount: ${cleanAmount}`);

    // 3. Obtener la cuenta fuente para conocer el Sequence Number actual
    const adminPublicKey = process.env.ADMIN_PUBLIC_KEY || 'GDQD...'; // SOLO la clave pública
    const sourceAccount = await server.getAccount(adminPublicKey);

    // 4. Construir la transacción de Soroban (Llamada al contrato Escrow)
    const contract = new Contract(contractId);
    
    // We build the transaction calling our Escrow claim_prize method
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'claim_prize',
          Address.fromString(studentWallet).toScVal(),
          nativeToScVal(Number(partnerId), { type: 'u32' }),
          nativeToScVal(BigInt(amount), { type: 'i128' })
        )
      )
      .setTimeout(30) // Prevenir que exceda el timeout de Vercel
      .build();

    // 5. ESTÁNDAR DE LA INDUSTRIA: Firmar mediante KMS remoto
    // La clave privada NUNCA reside en la memoria de la función de Vercel
    const kms = getKMSClient();
    const txSigned = await kms.signTransaction(tx, process.env.KMS_KEY_ALIAS || 'alias/e4c-disbursement-key');

    // 6. Enviar a la red de forma asíncrona para evitar timeouts en Vercel
    const response = await server.sendTransaction(txSigned);

    if (response.status === 'PENDING') {
      return NextResponse.json({
        success: true,
        txHash: response.hash,
        status: response.status,
        message: 'Transacción enviada al relayer/red.'
      }, { status: 202 });
    }

    throw new Error(`Error en Soroban RPC: ${JSON.stringify(response.errorResult)}`);
  } catch (error: any) {
    const errorMsg = sanitizeLog(error.message || 'Internal Server Error');
    console.error(`[Disbursement Error] ${errorMsg}`);
    
    // OWASP A05: Informar de manera genérica para evitar disclosure de detalles internos/stack traces
    return NextResponse.json({ 
      error: 'Disbursement failed. Please verify authorization and transaction details.' 
    }, { status: 500 });
  }
}

